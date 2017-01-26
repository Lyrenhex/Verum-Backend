const verumClient = require("./index").Client;

console.log("Initialising test client.")
var client = new verumClient("localhost");
client.Events.on('node_source', (address) => {
  console.log("Node source: ", address);
});
/* client.sendText(JSON.stringify({
  type: "get_pubkey",
  user: "Scratso"
})); */
