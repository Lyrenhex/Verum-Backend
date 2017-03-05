/*
Verum Encrypted Chat Communication Module
Copyright (C) 2017  Damian Heaton <dh64784@gmail.com> (damianheaton.com)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

// CLIENT MODULES
const pgp = require("openpgp"); // encryption - not touched on server
const eventEmitter = require("events"); // asynchronous client interface
const cryptojs = require("crypto-js"); // fingerprint generation
const sha3 = cryptojs.SHA3;
const hex = cryptojs.enc.Hex;

// SERVER MODULES
const fs = require("fs"); // handle file-based stuff (saving, etc)
const passhash = require("password-hash"); // don't store plaintext passwords

// MODULES FOR BOTH
const ws = require("nodejs-websocket"); // client-server comms is websockets

pgp.config.aead_protect = true;

/*
Server Stuff
*/
class Server {
  /*
  Construct the server class. This may be optionally provided a configuration options object.

  Config.public determines whether the server accepts new registrations.
  Config.source is a *required value* if the Server has modified source code from that provided by the FreeChat Project, as per the terms of the GNU Affero General Public License, and should be a link to the Node's source code.
  */
  constructor (port = 9873, config = null) {
    if (config === null) config = {
      public: true,
      source: "https://github.com/freechat-project/Verum-Server",
    }
    this.Config = config;
    this.Config.port = port;
    port, config = undefined;
    this.Users = {};
    this.LoggedInUsers = {};
    this.LoggedInConns = {};
    var that = this;
    this.saveData = function() {
      var json = JSON.stringify(that.Users, null, 2);
      console.log("Saving data. Please avoid server closing.");
      fs.writeFile("users.json", json, (err) => {
        if (err)
          console.log("Unable to save users.json: ", err);
      });
      var confJson = JSON.stringify(that.Config, null, 2);
      fs.writeFile("conf.json", confJson, (err) => {
        if (err)
          console.log("Unable to save conf.json: ", err);
      });
    }
    fs.readFile ("users.json", (err, data) => {
      if (err)
        console.log("Error accessing persistent user data. Probably just nonexistant file?", err);
      else {
        var json = JSON.parse(data);
        var user;
        for(user in json){
          var userData = json[user];

          if (!passhash.isHashed(userData.password)){
            // user's password is NOT Hashed -- hash it now (retroactively)
            userData.password = passhash.generate(userData.password);
          }

          that.Users[user] = userData;
        }
      }

      setInterval(that.saveData, 1800000); // save user data persistently every half-hour.
    });

    this.websock = ws.createServer(function(conn){
      conn.sendText(that.respond("welcome", that.Config.source));
      conn.on("close", (code, reason) => {
        if (that.LoggedInConns[conn] !== undefined) {
          that.LoggedInUsers[that.LoggedInConns[conn].user] = undefined;
          that.LoggedInConns[conn] = undefined;
        }
      });
      conn.on("text", function(str){
        // received JSON text string (assumedly). try to parse it, to determine the point of it.
        try {
          var json = JSON.parse(str);
          if (that.LoggedInConns[conn] !== undefined) { // if the user is keepauth
            // we need to imitate them NOT being keepauth, for ease's sake, for commands that need it :>
            var authCommands = [
              "user_update_password",
              "user_update_key",
              "messages_get",
              "messages_got"
            ]
            if (authCommands.contains(json.type)) { // if they've entered an auth command
              // populate the values
              json.user = that.LoggedInConns[conn].user;
              json.pass = that.LoggedInConns[conn].pass;
              if (json.type === "user_update_password") {
                json.oldPass = json.pass;
              }
            }
          }
          switch(json.type){
            case "keepauth":
              if(that.Users.hasOwnProperty(json.user)) {
                if(passhash.verify(json.pass, that.Users[json.user].password)) {
                  var authData = {
                    conn: conn,
                    user: json.user,
                    pass: json.pass
                  }
                  that.LoggedInConns[conn] = authData;
                  that.LoggedInUsers[json.user] = authData;
                  conn.sendText(that.respond("keepauth", "Successfully activated keepauth mode. Username and passwords no longer need providing for this session, and messages will be auto-forwarded to you."));
                } else {
                  conn.sendText(that.error("Incorrect Password", "The password provided to authenticate the requested operation does not match the password tied to this account. The operation was not completed."));
                }
              } else {
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
              break;
            case "get_pubkey":
              try {
                conn.sendText(that.respond("public_key", that.Users[json.user].pubkey));
                if(that.Users[json.user].pubkey === undefined){
                  conn.sendText(that.error("User Missing Public Key", "The requested user appears to have no public key attached to their account: most likely, they registered their account with missing information. It's advised that you ask them to set their public key."));
                }
              }catch(e){
                conn.sendText(that.error("User Doesn't Exist", "That user's data could not be found. Are you sure you're querying the right user on the right Node?"));
              }
              break;
            case "send_message":
              try {
                that.Users[json.user].messages.push(json.data);
              }catch(e){
                conn.sendText(that.error("User Doesn't Exist", "That user's data could not be found. Are you sure you're querying the right user on the right Node?"));
              }
              break;
            case "user_register":
              if(that.Config.public){
                if(!that.Users.hasOwnProperty(json.user)) {
                  that.Users[json.user] = {
                    password: passhash.generate(json.pass),
                    pubkey: json.pubkey,
                    messages: []
                  }
                  conn.sendText(that.respond("registered", "Successfully created user."));
                }else{
                  conn.sendText(that.error("User Already Exists", "A user with that name already exists on this Node. You can either pick a different username, or try a different Node."));
                }
              }else{
                conn.sendText(that.error("Private Node", "This Node has been configured to not be public, meaning that it is not accepting user registrations. Perhaps try join a different Node?"));
              }
              break;
            case "user_update_password":
              if(that.Users.hasOwnProperty(json.user)) {
                if(passhash.verify(json.oldPass, that.Users[json.user].password)) {
                  that.Users[json.user].password = passhash.generate(json.newPass);
                  conn.sendText(that.respond("updated", "Successfully updated password."));
                } else {
                  conn.sendText(that.error("Incorrect Password", "The password provided to authenticate the requested operation does not match the password tied to this account. The operation was not completed."));
                }
              } else {
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
              break;
            case "user_update_key":
              if(that.Users.hasOwnProperty(json.user)) {
                if(passhash.verify(json.pass, that.Users[json.user].password)){
                  that.Users[json.user].pubkey = json.pubkey;
                  conn.sendText(that.respond("updated", "Successfully updated public key."));
                }else{
                  conn.sendText(that.error("Incorrect Password", "The password provided to authenticate the requested operation does not match the password tied to this account. The operation was not completed."));
                }
              }else{
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
              break;
            case "message_send":
              if(that.Users.hasOwnProperty(json.user)) {
                var time = new Date();
                that.Users[json.user].messages.push({
                  message: json.msg,
                  sender: json.from,
                  timestamp: time
                });
                if (that.LoggedInUsers[json.user] !== undefined) { // recipient is keepauth
                  try {
                    that.LoggedInUsers[json.user].conn.sendText(
                      that.respond("messages", that.Users[json.user].messages));
                  } catch (e) { }
                }
                conn.sendText(that.respond("sent", "Message sent successfully."));
                that.saveData();
              }else{
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
              break;
            case "messages_get":
              if(that.Users.hasOwnProperty(json.user)) {
                if(passhash.verify(json.pass, that.Users[json.user].password)){
                  conn.sendText(that.respond("messages", that.Users[json.user].messages));
                }else{
                  conn.sendText(that.error("Incorrect Password", "The password provided to authenticate the requested operation does not match the password tied to this account. The operation was not completed."));
                }
              }else{
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
              break;
            case "messages_got":
              if(that.Users.hasOwnProperty(json.user)) {
                if(passhash.verify(json.pass, that.Users[json.user].password)){
                  that.Users[json.user].messages = []; // we're compliant: kill the message archives.
                  that.saveData(); // and force an asynchronous data save: otherwise, the data is still there until the next save, which *we do not want!*
                }else{
                  conn.sendText(that.error("Incorrect Password", "The password provided to authenticate the requested operation does not match the password tied to this account. The operation was not completed."));
                }
              }else{
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
              break;
          }
        }catch(e){
          console.log("Unexpected unparseable string: ", str);
          console.log(e);
          conn.sendText(that.error("Bad Format", "Unable to parse malformed JSON."));
        }
      });
    });
  }

  error (t, s) {
    var obj = {
      type: "error",
      title: t,
      data: s
    }
    var err = JSON.stringify(obj);
    return err;
  }
  respond (r, d) {
    var obj = {
      type: r,
      data: d
    }
    var response = JSON.stringify(obj);
    return response;
  }

  listen () {
    this.websock.listen(this.Config.port);
  }
}

/*
Client Stuff
*/
class Client {
  /*
  Construct a Client class. This requires the address of the user's Node, with  an optional port provided. nodePort defaults to 9873 should `null` (or any falsey value) be provided, or if not specified.
  */
  constructor (nodeAddr, nodePort=null) {
    if (!nodePort)
      nodePort = 9873;

    class Events extends eventEmitter {}

    this.Events = new Events();

    var that = this;

    this.lastPubKeyRequestee;

    this.websock = ws.connect(`ws://${nodeAddr}:${nodePort}`);
    this.websock.on("text", function(str){
      var json = JSON.parse(str);
      switch(json.type){
        case "error":
          that.Events.emit("error", json.title, json.data);
          break;
        case "welcome":
          that.Events.emit("welcome", json.data);
          break;
        case "public_key":
          that.Events.emit("public_key", that.lastPubKeyRequestee, json.data);
          break;
        case "registered":
          that.Events.emit("registered", json.data);
          break;
        case "sent":
          that.Events.emit("message_sent", json.data);
          break;
        case "messages":
          that.Events.emit("messages_recv", json.data);
          break;
        case "updated":
          that.Events.emit("user_data_updated", json.data);
          break;
      }
    });
  }

  register (username, password, publicKey) {
    if (publicKey instanceof Key)
      publicKey = publicKey.key;

    this.websock.sendText(JSON.stringify({
      type: "user_register",
      user: username,
      pubkey: publicKey,
      pass: password
    }));
  }
  updatePubKey (username, password, publicKey) {
    if (publicKey instanceof Key)
      publicKey = publicKey.key;

    this.websock.sendText(JSON.stringify({
      type: "user_update_key",
      user: username,
      pubkey: publicKey,
      pass: password
    }));
  }
  updatePassword (username, oldPassword, newPassword) {
    this.websock.sendText(JSON.stringify({
      type: "user_update_password",
      user: username,
      oldPass: oldPassword,
      newPass: newPassword
    }));
  }
  getMessages (username, password) {
    this.websock.sendText(JSON.stringify({
      type: "messages_get",
      user: username,
      pass: password
    }));
  }
  gotMessages (username, password) {
    this.websock.sendText(JSON.stringify({
      type: "messages_got",
      user: username,
      pass: password
    }));
  }

  getPubKey (requestee) {
    this.lastPubKeyRequestee = requestee;
    this.websock.sendText(JSON.stringify({
      type: "get_pubkey",
      user: requestee
    }));
  }

  sendEncMsg (recipient, message, from, secretKey) {
    var that = this;

    if (secretKey instanceof Key)
      secretKey = secretKey.key;

    this.Events.on('public_key', function sendEncMsg2 (user, key) {
      if(user === recipient){
        var options = {
          data: message,
          publicKeys: pgp.key.readArmored(key).keys,
          privateKeys: pgp.key.readArmored(secretKey).keys // we must sign the message, to prove to the recipient that this was sent by me and not an impostor.
        }

        console.log("Encrypting message...");
        pgp.encrypt(options).then(function(ciphertext){
          that.websock.sendText(JSON.stringify({
            type: "message_send",
            user: recipient,
            msg: ciphertext,
            from: from
          }));
          that.Events.removeListener('public_key', sendEncMsg2); // listener's served its purpose; destroy it.
        });
      }
    });
    this.getPubKey(recipient);
  }
  getEncMsgs (username, password, secretKey=null) {
    var that = this;
    this.Events.on('messages_recv', function gotEncMsgs (messages) {
      messages.forEach((message, index) => {
        var senderPubKey = null;
        var senderNode = message.sender.split("@")[1].split(":");
        var senderSrvClient = new Client(senderNode[0], (senderNode[1] !== undefined) ? senderNode[1] : null); // create a client connection to the sender's Node.
        senderSrvClient.Events.on('public_key', function (user, key) {
          if(user === message.sender.split("@")[0]){
            senderPubKey = key;
            next();
          }
        });
        senderSrvClient.Events.on('error', function(err, ext){
          if (err === "Unknown User") {
            console.log(err, ext, "As the identity could not be verified, this may well be spam.");
          }
          next();
        });
        senderSrvClient.Events.on('welcome', function (address){
          senderSrvClient.getPubKey(message.sender.split("@")[0]);
        });
        function next () {
          that.Events.emit("message", message.message.data, message.sender, message.timestamp, senderPubKey); // in case we weren't given the secret key, or the client wants to get the encrypted data anyway.

          if(secretKey !== null){
            if (secretKey instanceof Key)
              secretKey = secretKey.key;

            var options = {
              message: pgp.message.readArmored(message.message.data),
              privateKey: pgp.key.readArmored(secretKey).keys[0]
            }

            if(senderPubKey !== null)
              options.publicKeys = pgp.key.readArmored(senderPubKey).keys;

            pgp.decrypt(options).then(function(decrypted){
              that.Events.emit("message_decrypted", decrypted.data, message.sender, message.timestamp, (decrypted.signatures[0] !== undefined) ? decrypted.signatures[0].valid : false);
            });
          }

          senderSrvClient = undefined;
        }
      });
      that.gotMessages(username, password);
      that.Events.emit("message_buffer_emptied");
    });
    this.getMessages(username, password);
  }
}

class Key {
  /*
  Split key handling off into a separate class, noting fingerprinting etc that may need to be done.
  */
  constructor (key) {
    this.key = key;
    this.fingerprint = hex.stringify(sha3(key));
  }
}

class Auto {
  constructor (username, password, nodeAddr, nodePort=9873) {
    this.Client = new Client (nodeAddr, nodePort);
    this.Client.on ("welcome", msg => {
      this.Client.websock.sendText(JSON.stringify({
        type: "keepauth",
        user: username,
        pass: password
      }));
    });

    this.websock = this.Client.websock;
    this.Events = this.Client.Events;
  }

  updatePubKey (publicKey) {
    if (publicKey instanceof Key)
      publicKey = publicKey.key;

    this.websock.sendText(JSON.stringify({
      type: "user_update_key",
      pubkey: publicKey,
    }));
  }
  updatePassword (newPassword) {
    this.websock.sendText(JSON.stringify({
      type: "user_update_password",
      newPass: newPassword
    }));
  }
  getMessages () {
    this.websock.sendText(JSON.stringify({
      type: "messages_get"
    }));
  }
  gotMessages () {
    this.websock.sendText(JSON.stringify({
      type: "messages_got"
    }));
  }

  getPubKey (requestee) {
    this.lastPubKeyRequestee = requestee;
    this.websock.sendText(JSON.stringify({
      type: "get_pubkey",
      user: requestee
    }));
  }

  sendEncMsg (recipient, message, from, secretKey) {
    var that = this;

    if (secretKey instanceof Key)
      secretKey = secretKey.key;

    this.Events.on('public_key', function sendEncMsg2 (user, key) {
      if(user === recipient){
        var options = {
          data: message,
          publicKeys: pgp.key.readArmored(key).keys,
          privateKeys: pgp.key.readArmored(secretKey).keys // we must sign the message, to prove to the recipient that this was sent by me and not an impostor.
        }

        console.log("Encrypting message...");
        pgp.encrypt(options).then(function(ciphertext){
          that.websock.sendText(JSON.stringify({
            type: "message_send",
            user: recipient,
            msg: ciphertext,
            from: from
          }));
          that.Events.removeListener('public_key', sendEncMsg2); // listener's served its purpose; destroy it.
        });
      }
    });
    this.getPubKey(recipient);
  }
  getEncMsgs (secretKey=null) {
    var that = this;
    this.Events.on('messages_recv', function gotEncMsgs (messages) {
      messages.forEach((message, index) => {
        var senderPubKey = null;
        var senderNode = message.sender.split("@")[1].split(":");
        var senderSrvClient = new Client(senderNode[0], (senderNode[1] !== undefined) ? senderNode[1] : null); // create a client connection to the sender's Node.
        senderSrvClient.Events.on('public_key', function (user, key) {
          if(user === message.sender.split("@")[0]){
            senderPubKey = key;
            next();
          }
        });
        senderSrvClient.Events.on('error', function(err, ext){
          if (err === "Unknown User") {
            console.log(err, ext, "As the identity could not be verified, this may well be spam.");
          }
          next();
        });
        senderSrvClient.Events.on('welcome', function (address){
          senderSrvClient.getPubKey(message.sender.split("@")[0]);
        });
        function next () {
          that.Events.emit("message", message.message.data, message.sender, message.timestamp, senderPubKey); // in case we weren't given the secret key, or the client wants to get the encrypted data anyway.

          if(secretKey !== null){
            if (secretKey instanceof Key)
              secretKey = secretKey.key;

            var options = {
              message: pgp.message.readArmored(message.message.data),
              privateKey: pgp.key.readArmored(secretKey).keys[0]
            }

            if(senderPubKey !== null)
              options.publicKeys = pgp.key.readArmored(senderPubKey).keys;

            pgp.decrypt(options).then(function(decrypted){
              that.Events.emit("message_decrypted", decrypted.data, message.sender, message.timestamp, (decrypted.signatures[0] !== undefined) ? decrypted.signatures[0].valid : false);
            });
          }

          senderSrvClient = undefined;
        }
      });
      that.gotMessages();
      that.Events.emit("message_buffer_emptied");
    });
    this.getMessages();
  }

  kill () {
    this.Client.websock.close();
  }
}

// make the Client and Server objects publicly accessible.
exports.Client = Client;
exports.Client.Key = Key;
exports.Key = Key;
exports.Server = Server;
