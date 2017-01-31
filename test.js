const verumClient = require("./index").Client;

console.log("Initialising test client.")

var pubUsr;

var pubKey = "-----BEGIN PGP PUBLIC KEY BLOCK----- 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Ucnp-----END PGP PUBLIC KEY BLOCK-----";

var client = new verumClient("devel.node.verum.damianheaton.com");
client.Events.on('welcome', (address) => {
  console.log("Node source: ", address);
  client.sendEncMsg("Scratso", "yo, this here be another test :)", "Scratso@devel.node.verum.damianheaton.com");
  client.getEncMsgs("Scratso", "dummypass");
});
client.Events.on('message', (ciphertext, from) => {
  console.log(`Received message from ${from}: ${ciphertext}`);
});
client.Events.on('public_key', (user, key) => {
  console.log(`${user}'s public key: ${key}`);
});
client.Events.on('registered', (welcome) => {
  console.log("Registered successfully: ", welcome);
});
client.Events.on('error', (err, ext) => {
  console.log("ERROR", err, ext);
  if (err === "Unknown User"){
    client.register ("Scratso", "dummypass", pubKey);
  } else if (err == "User Missing Public Key") {
    client.updatePubKey ("Scratso", "dummypass", pubKey);
  }
});
