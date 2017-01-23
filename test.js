const verum = require("./index");

switch(process.argv[2]){
  case "server":
    console.log("Starting test server.");
    var serv = new verum.Server();
    console.log(serv);
    break;
  case "client":
    console.log("Initialising test client.")
    var client = new verum.Client();
    client.sendText(JSON.stringify({
      type: "get_pubkey",
      user: "Scratso"
    }));
    break;
  default:
    console.log("Uhh... Not sure what you want me to do? Try npm run <server|client> :)");
}
