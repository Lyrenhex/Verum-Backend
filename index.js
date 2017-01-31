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

const pgp = require("openpgp");
const ws = require("nodejs-websocket");
const fs = require("fs");
const eventEmitter = require("events");

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
    this.Users = {};
    var that = this;
    this.saveData = function() {
      var json = JSON.stringify(that.Users, null, 2);
      console.log("Saving data. Please avoid server closing.");
      fs.writeFile("users.json", json, (err) => {
        if (err)
          console.log("Unable to save users.json: ", err);
        else
          console.log("Saved user data.");
      });
      var confJson = JSON.stringify(that.Config, null, 2);
      fs.writeFile("conf.json", confJson, (err) => {
        if (err)
          console.log("Unable to save conf.json: ", err);
        else
          console.log("Saved config data.");
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
          that.Users[user] = userData;
        }
      }

      setInterval(that.saveData, 300000); // save user data persistently every five minutes.
    });

    this.websock = ws.createServer(function(conn){
      console.log("Recorded new connection.");
      conn.sendText(that.respond("welcome", that.Config.source));
      conn.on("text", function(str){
        // received JSON text string (assumedly). try to parse it, to determine the point of it.
        try {
          var json = JSON.parse(str);
          console.log("Received: ", json);
          switch(json.type){
            case "get_pubkey":
              try {
                conn.sendText(that.respond("public_key", that.Users[json.user].pubkey));
                if(that.Users[json.user].pubkey === undefined){
                  conn.sendText(that.error("User Missing Public Key", "The requested user appears to have no public key attached to their account: most likely, they registered their account with missing information. It's advised that you ask them to set their public key."));
                }
              }catch(e){
                conn.sendText(that.error("Unknown User", "That user's data could not be found. Are you sure you're querying the right user on the right Node?"));
              }
              break;
            case "send_message":
              try {
                that.Users[json.user].messages.push(json.data);
              }catch(e){
                conn.sendText(that.error("Unknown User", "That user's data could not be found. Are you sure you're querying the right user on the right Node?"));
              }
              break;
            case "user_register":
              if(that.Config.public){
                if(!that.Users.hasOwnProperty(json.user)) {
                  that.Users[json.user] = {
                    password: json.pass,
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
            case "user_update_key":
              if(that.Users.hasOwnProperty(json.user)) {
                if(that.Users[json.user].password === json.pass){
                  that.Users[json.user].pubkey = json.pubkey;
                  conn.sendText(that.respond("updated", "Successfully updated public key."));
                }else{
                  conn.sendText(that.error("Incorrect Password", "The password provided to authenticate the requested operation does not match the password tied to this account. The operation was not completed."));
                }
              }else{
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
            case "message_send":
              if(that.Users.hasOwnProperty(json.user)) {
                that.Users[json.user].messages.push({
                  message: json.msg,
                  sender: json.from
                });
                conn.sendText(that.respond("sent", "Message sent successfully."));
              }else{
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
            case "messages_get":
              if(that.Users.hasOwnProperty(json.user)) {
                if(that.Users[json.user].password === json.pass){
                  conn.sendText(that.respond("messages", that.Users[json.user].messages));
                }else{
                  conn.sendText(that.error("Incorrect Password", "The password provided to authenticate the requested operation does not match the password tied to this account. The operation was not completed."));
                }
              }else{
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
            case "messages_got":
              if(that.Users.hasOwnProperty(json.user)) {
                if(that.Users[json.user].password === json.pass){
                  that.Users[json.user].messages = []; // we're compliant: kill the message archives.
                  that.saveData(); // and force an asynchronous data save: otherwise, the data is still there until the next save, which *we do not want!*
                }else{
                  conn.sendText(that.error("Incorrect Password", "The password provided to authenticate the requested operation does not match the password tied to this account. The operation was not completed."));
                }
              }else{
                conn.sendText(that.error("User Doesn't Exist", "A user with that name wasn't found on this Node. Are you sure you're querying the right Node?"));
              }
          }
        }catch(e){
          console.log("Unexpected unparseable string: ", str);
          console.log(e);
          conn.sendText(that.error("Bad Format", "Unable to parse malformed JSON."));
        }
      });
      conn.on("close", function(code, reason){
        console.log("Connection closed.");
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
  constructor (nodeAddr, nodePort=9873) {
    class Events extends eventEmitter {}

    this.Events = new Events();

    var that = this;

    this.lastPubKeyRequestee;

    this.websock = ws.connect(`ws://${nodeAddr}:${nodePort}`);
    console.log(this.websock);
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
      }
    });
  }

  register (username, password, publicKey) {
    this.websock.sendText(JSON.stringify({
      type: "user_register",
      user: username,
      pubkey: publicKey,
      pass: password
    }));
  }
  updatePubKey (username, password, publicKey) {
    this.websock.sendText(JSON.stringify({
      type: "user_update_key",
      user: username,
      pubkey: publicKey,
      pass: password
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

  sendEncMsg (recipient, message, from) {
    var that = this;
    this.Events.on('public_key', function sendEncMsg2 (user, key) {
      if(user === recipient){
        var options = {
          data: message,
          publicKeys: pgp.key.readArmored(key).keys
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
  getEncMsgs (username, password) {
    var that = this;
    this.Events.on('messages_recv', function gotEncMsgs (messages) {
      messages.forEach((message, index) => {
        that.Events.emit("message_new", message.msg, message.from); // we aren't gonna handle decryption; that should definitely be done by the client in question.
      });
      that.gotMessages(username, password);
    });
    this.getMessages(username, password);
  }
}

// make the Client and Server objects publicly accessible.
exports.Client = Client;
exports.Server = Server;
