const verumServ = require("./index").Server;

if(process.argv.indexOf("--travis-ci") !== -1){
  setTimeout(function(){
    process.exit();
  }, 30000);
}

console.log("Starting test server.");
var serv = new verumServ();
serv.websock.listen(9873);
