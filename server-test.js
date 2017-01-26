const verumServ = require("./index").Server;

console.log("Starting test server.");
var serv = new verumServ();
serv.websock.listen(9873);
console.log(serv);
