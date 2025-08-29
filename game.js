const { useEffect, useMemo, useRef, useState, useLayoutEffect } = React;
const h = React.createElement;

// Pomůcka na cesty s diakritikou
const u = (name) => encodeURI("./" + name);

// Assety (včetně ikony listu)
const ASSETS = {
  logo: u("kvíz logo.png"),
  petr: u("Petr.png"),
  erika: u("erika.png"),
  good: u("good.png"),
  wrong: u("wrong.png"),
  list: u("list.png"),
  bgIntro: u("pozadí intro.gif"),
  bgQuiz: u("pozadí otázky.gif"),
  bgResults: u("pozadí výsledky.gif"),
  bgFinal: u("závěrečné pozadí.jpg"),
};

// Otázky (ponecháno dle poslední verze)
const QUESTIONS = [
  { q: "Kolik prstů celkem máme?", options: ["41","40","39"], correct: 1 },
  { q: "Jak se jmenuje nejoblíbenější Pokémon Eriky?", options: ["Eevee","Jaromír","Jigglypuff"], correct: 2 },
  { q: "Doplň text k větě „Hovno, hovno, není mu nic, vole… xxx“.", options: ["je mu málo!","Je mu hodně!","Je špatnej kámo."], correct: 1 },
  { q: "Nejpravděpodobnější důvod našeho rozvodu?", options: ["Bordel doma","Odlišné zájmy","Nikotínové sáčky"], correct: 2 },
  { q: "Jaká byla Petrova nejdelší letošní abstinence od nikotinu?", options: ["1 měsíc","2 měsíce","4 měsíce"], correct: 2 },
  { q: "Při páchání jakého trestného činu byl Petr ve 14 letech přistižen?", options: ["Sprejerství","Ohrožení mravní výchovy mládeže","Šíření toxikomanie"], correct: 0 },
  { q: "Která hra téměř způsobila rozpad vztahu Petra a Eriky?", options: ["Sims 4","Destiny 2","Hentai Misadventures Delta"], correct: 1 },
  { q: "Kterou z těchto věcí by Petr popsal jako „Absolutní pičovina, ztráta času“?", options: ["Záhada Blair Witch","Jujutsu Kaisen","90 Day Fiancé"], correct: 0 },
  { q: "Jaký byl osud Tonyho Soprana na konci poslední série kultovního seriálu „The Sopranos“?", options: ["Šel do vězení","????????????????","Zemřel v restauraci"], correct: 1 },
  { q: "Kdo z nás má daddy issues?", options: ["Erika","Petr","Oba"], correct: 2 },
];

function preload(srcs) { srcs.forEach((s)=>{ const i=new Image(); i.src=s; }); }

/* ---------- Firebase ---------- */
function useFirestore(){
  const [db,setDb] = useState(null);
  useEffect(()=>{
    try{
      const cfg = window.FIREBASE_CONFIG;
      if(!cfg) return;
      const app = window.firebase.apps?.length
        ? window.firebase.app()
        : window.firebase.initializeApp(cfg);
      setDb(window.firebase.firestore(app));
    }catch(e){ console.warn("Firebase init error:", e); }
  },[]);
  return db;
}
async function saveResult(db, name, score, total){
  if(!db) return false;
  try{
    await db.collection("results").add({
      name, score, total, pct: Math.round(score/total*100),
      ts: window.firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  }catch(e){ console.warn("Uložení selhalo:", e); return false; }
}

function Game(){
  // intro1 -> intro2 -> quiz -> result -> name -> score
  const [screen, setScreen] = useState("intro1");
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null); // uživatel jen vybral (ještě nepotvrdil)
  const [chosen, setChosen] = useState(null);     // potvrzená/vyhodnocená odpověď
  const [score, setScore] = useState(0);
  const [playerName, setPlayerName] = useState("");
  const [feedback, setFeedback] = useState(null);  // null | 'good' | 'wrong'
  const FEEDBACK_MS = 1500;

  useEffect(()=>{ preload(Object.values(ASSETS)); },[]);

  // výběr pozadí
  const bg = useMemo(()=>{
    if(screen==="intro1"||screen==="intro2") return ASSETS.bgIntro;
    if(screen==="quiz") return ASSETS.bgQuiz;
    if(screen==="result") return ASSETS.bgResults;
    if(screen==="name") return ASSETS.bgFinal;   // snímek 15
    if(screen==="score") return ASSETS.bgIntro;  // snímek 16
    return ASSETS.bgIntro;
  },[screen]);

  // ---- umístění postav nad dialog (dynamicky podle výšky dialogu) ----
  const d1Ref = useRef(null), d2Ref = useRef(null);
  const [d1h,setD1h]=useState(160), [d2h,setD2h]=useState(160);
  useLayoutEffect(()=>{
    function recalc(){
      if(d1Ref.current) setD1h(d1Ref.current.offsetHeight + 16);
      if(d2Ref.current) setD2h(d2Ref.current.offsetHeight + 16);
    }
    recalc();
    window.addEventListener("resize", recalc);
    return ()=>window.removeEventListener("resize", recalc);
  },[]);

  // ---- výška panelu otázek pro přesné umístění feedbacku ----
  const qpRef = useRef(null);
  const [qpH, setQpH] = useState(0);
  useLayoutEffect(()=>{
    function recalc(){ if(qpRef.current) setQpH(qpRef.current.offsetHeight); }
    recalc();
    window.addEventListener("resize", recalc);
    return ()=>window.removeEventListener("resize", recalc);
  },[screen]);

  // přechody
  const nextIntro = () => setScreen("intro2");
  const startQuiz = () => { setIdx(0); setScore(0); setSelected(null); setChosen(null); setScreen("quiz"); };
  const toName = () => setScreen("name");

  // logika kvízu
  const current = QUESTIONS[idx];

  // 1) Pouze výběr (bez vyhodnocení)
  const onSelect = (i) => {
    if (chosen !== null) return; // při zobrazení feedbacku nelze měnit
    setSelected(i);
  };

  // 2) Tlačítko „Další“ provede vyhodnocení + feedback + posun
  const onSubmit = () => {
    if (selected === null || chosen !== null) return;
    setChosen(selected);

    const correct = (selected === current.correct);
    if (correct) setScore((s)=>s+1);
    setFeedback(correct ? "good" : "wrong");

    // po 1.5 s automaticky přejdeme dál
    setTimeout(()=>{
      setFeedback(null);
      setChosen(null);
      setSelected(null);
      if (idx < QUESTIONS.length - 1){
        setIdx(idx+1);
      }else{
        setScreen("result");
      }
    }, FEEDBACK_MS);
  };

  const pct = Math.round((score / QUESTIONS.length) * 100);

  /* -------- Firestore -------- */
  const db = useFirestore();
  const [recent, setRecent] = useState([]);
  useEffect(()=>{
    if((screen!=="name" && screen!=="score") || !db) return;
    return db.collection("results").orderBy("ts","desc").limit(50)
      .onSnapshot((snap)=>{
        const list=[]; snap.forEach(d=>list.push(d.data())); setRecent(list);
      });
  },[db, screen]);

  // UI: logo neukazujeme na "result" ani "score"
  const showLogo = screen!=="name" && screen!=="result" && screen!=="score";

  /* ------ Snímky ------ */
  const Intro1 = h(React.Fragment,null,
    // ikonka pro rychlý náhled výsledků
    h("img",{className:"results-icon", src:ASSETS.list, alt:"Výsledky", onClick:()=>setScreen("score")}),
    h("img",{className:"character petr", src:ASSETS.petr, alt:"Petr", style:{ bottom: d1h + "px" }}),
    h("div",{className:"dialog", ref:d1Ref},
      h("div",{className:"dialog-inner"},
        h("p",null,"Jak moc znáš Eriku a mě? Hodně? Aha, tak to ukaž.")
      ),
      h("div",{className:"row"},
        h("button",{className:"btn btn-blue", onClick:nextIntro},"Si piš")
      )
    )
  );

  const Intro2 = h(React.Fragment,null,
    h("img",{className:"character erika", src:ASSETS.erika, alt:"Erika", style:{ bottom: d2h + "px" }}),
    h("div",{className:"dialog", ref:d2Ref},
      h("div",{className:"dialog-inner"},
        h("p",null,"8 správně = překvapení. Méně než 3 = taky překvapení (hluboké pohrdání).")
      ),
      h("div",{className:"row"},
        h("button",{className:"btn btn-gray", onClick:()=>setScreen("intro1")},"Zpět"),
        h("button",{className:"btn btn-green", onClick:startQuiz},"Začít!")
      )
    )
  );

  const Quiz = h(React.Fragment,null,
    // feedback – velký jako postavy a nalepený nad panel (ukáže se až po potvrzení)
    h("img",{ className:"feedback" + (feedback ? " show": ""),
      src: feedback==="good" ? ASSETS.good : ASSETS.wrong, alt:"feedback",
      style:{ bottom: qpH + "px" }
    }),
    h("div",{className:"question-panel", ref:qpRef},
      h("div",{className:"q-header"},
        h("div",null,current.q),
        h("div",null, (idx+1) + "/" + QUESTIONS.length )
      ),
      h("div",{className:"q-body"},
        current.options.map((opt,i)=>h("div",{
            key:i,
            className:
              "choice" +
              (selected===i ? " selected" : "") + // jen označení
              (chosen!==null
                ? (i===current.correct ? " correct" : (i===chosen ? " wrong" : ""))
                : ""),
            onClick:()=>onSelect(i)
          }, opt)
        ),
        h("div",{className:"row"},
          h("button",{
            className:"btn btn-blue",
            disabled: selected===null || chosen!==null,
            onClick:onSubmit
          },"Další")
        )
      )
    )
  );

  const Result = h(React.Fragment,null,
    // středové velké skóre, bez good/wrong a bez loga
    h("div",{className:"big-score"}, `${score}/${QUESTIONS.length}`),
    h("div",{className:"dialog", style:{bottom:"12px"}},
      h("div",{className:"dialog-inner"},
        pct>=80
          ? h("p",null,`Tvoje skóre je ${pct} %! Jsi stejně divnej/divná jako Erika a Petr (gratulujeme, I guess). Nezapomeň si vyzvednout dárek!`)
          : h("p",null,"Tvoje skóre je pod 80 %. Pokud nejsi někdo, kdo tady pracuje, měl bys tomu věnovat víc. A pokud tady pracuješ, tak zpátky do práce!!!! Ale ok, taky si vem dárek.")
      ),
      h("div",{className:"row"},
        h("button",{className:"btn btn-blue", onClick:()=>setScreen("name")},"Chci odměnu!")
      )
    )
  );

  // SNÍMEK 15 – „jméno“
  const NameScreen = h(React.Fragment,null,
    h("div",{className:"oneup"},"1UP"),
    h("div",{className:"dialog", style:{bottom:"18px"}},
      h("div",{className:"dialog-inner"},
        h("p",null,"Vyplň prosím svoje jméno a vyber si dárek ze stolu."),
        h("input",{
          className:"input",
          placeholder:"Tvoje jméno",
          value:playerName,
          onChange:(e)=>setPlayerName(e.target.value)
        })
      ),
      h("div",{className:"row"},
        h("button",{className:"btn btn-green", onClick: async ()=>{
          if(!playerName.trim()){ alert("Napiš svoje jméno 🙂"); return; }
          const ok = await saveResult(db, playerName.trim(), score, QUESTIONS.length);
          if(ok){ setPlayerName(""); setScreen("score"); }
          else{ alert("Nepodařilo se uložit (zkontroluj připojení)."); }
        }},"Zobraz výsledky")
      )
    )
  );

  // SNÍMEK 16 – „skore“ (seznam hráčů)
  const ScoreScreen = h(React.Fragment,null,
    h("div",{className:"dialog", style:{bottom:"18px"}},
      h("div",{className:"dialog-inner"},
        h("p",null,"Výsledky všech hráčů:"),
        h("div",{className:"results"},
          db
            ? (recent.length
                ? recent.map((r,i)=>h("p",{key:i}, `${r.name || "?"}: ${r.score}/${r.total} (${r.pct || Math.round((r.score/r.total)*100)} %)`))
                : h("p",null,"Načítám výsledky…"))
            : h("p",null,"Offline režim: Firebase není dostupné.")
        )
      ),
      h("div",{className:"row"},
        h("button",{className:"btn btn-gray", onClick:()=>{
          // reset do úvodu (záznamy v DB zůstávají)
          setScreen("intro1"); setScore(0); setIdx(0);
          setSelected(null); setChosen(null); setFeedback(null);
        }},"Ukončit hru")
      )
    )
  );

  return h("div",{className:"game"},
    h("div",{className:`screen ${screen}`, style:{backgroundImage:`url('${bg}')`}},
      showLogo && h("img",{className:"logo", src:ASSETS.logo, alt:"kviz logo"}),
      screen==="intro1" ? Intro1 :
      screen==="intro2" ? Intro2 :
      screen==="quiz"   ? Quiz   :
      screen==="result" ? Result :
      screen==="name"   ? NameScreen : ScoreScreen
    )
  );
}
