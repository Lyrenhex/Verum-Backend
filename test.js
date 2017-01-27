const verumClient = require("./index").Client;

console.log("Initialising test client.")

var pubUsr;

var client = new verumClient("devel.node.verum.damianheaton.com");
client.Events.on('welcome', (address) => {
  console.log("Node source: ", address);
  client.getPubKey("Scratso");
});
client.Events.on('public_key', (user, key) => {
  console.log(`${user}'s public key: ${key}`);
});
client.Events.on('registered', (welcome) => {
  console.log("Registered successfully: ", welcome);
});
client.Events.on('error', (err, ext) => {
  console.log("ERROR", err, ext);
  if (err === "Unknown User")
    client.register (Scratso, dummypass);
});
