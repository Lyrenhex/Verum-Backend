const verumClient = require("./index").Client;

console.log("Initialising test client.")

var pubUsr;

var client = new verumClient("138.68.133.247");
client.Events.on('welcome', (address) => {
  console.log("Node source: ", address);
  client.getPubKey("Scratso");
});
client.Events.on('public_key', (user, key) => {
  console.log(`${user}'s public key: ${key}`);
});
/* client.sendText(JSON.stringify({
  type: "get_pubkey",
  user: "Scratso"
})); */
