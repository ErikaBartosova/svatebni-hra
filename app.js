// Mount React app
(function(){
  const rootEl = document.getElementById("root");
  if(!rootEl){ console.error("Nenalezen #root"); return; }
  const root = ReactDOM.createRoot(rootEl);
  root.render(React.createElement(Game));
})();
