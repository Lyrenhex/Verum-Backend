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

/*
Server Stuff
*/
class Server {
  /*
  Construct the server class. This may be optionally provided a port (default 9873) and configuration options.

  Config.public determines whether the server accepts new registrations.
  Config.source is a *required value* if the Server has modified source code from that provided by the FreeChat Project, as per the terms of the GNU Affero General Public License.
  */
  constructor (port = 9873, config = {
    public: true,
    source: "https://github.com/freechat-project/Verum-Server"
  }) {
    this.Users = {};
    var that = this;
    fs.readFile ("users.json", (err, data) => {
      if (err)
        console.log("Error accessing persistent user data. Probably just nonexistant file?");
      else {
        var json = JSON.parse(data);
        var user;
        for(user in json){
          user = json[user];
          that.Users[user] = user;
        }
      }
    });

    this.websock = ws.createServer(function(conn){
      console.log("Recorded new connection.");
      conn.on("text", function(str){
        // received JSON text string (assumedly). try to parse it, to determine the point of it.
        try {
          var json = JSON.parse(str);
          console.log("Received: ", json);
          switch(json.type){
            case "get_pubkey":
              try {
                conn.sendText(this.respond("public_key", that.Users[json.user].pubkey));
              }catch(e){
                conn.sendText(this.error("Unknown User", "That user's data could not be found. Are you sure you're querying the right user on the right Node?"));
              }
            case "send_message":
              try {
                that.Users[json.user].messages.push(json.data);
              }catch(e){
                conn.sendText(this.error("Unknown User", "That user's data could not be found. Are you sure you're querying the right user on the right Node?"));
              }
          }
        }catch(e){
          console.log("Unexpected unparseable string: ", str);
          conn.sendText(this.error("Bad Format", "Unable to parse malformed JSON."));
        }
      });
    }).listen(port);
  }

  error (t, s) {
    var obj = {
      response: "error",
      type: t,
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
    return reponse;
  }
}

/*
Client Stuff
*/
class Client {
  constructor () {

  }
}

// make the Client and Server objects publicly accessible.
exports.Client = Client;
exports.Server = Server;
