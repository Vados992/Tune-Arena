const origin=document.getElementById("origin"),error=document.getElementById("error");
window.tuneSettings.get().then(config=>{origin.value=config.appUrl;});
for(const [id,operation,input]of [["server","save","origin"],["login","loginLink","link"]])document.getElementById(id).addEventListener("submit",async e=>{e.preventDefault();error.textContent="";try{await window.tuneSettings[operation](document.getElementById(input).value);}catch(e){error.textContent=e.message;}});
