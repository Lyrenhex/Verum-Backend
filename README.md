# Verum Backend

[![Join the chat at https://gitter.im/freechat-project/Verum-Backend](https://badges.gitter.im/freechat-project/Verum-Backend.svg)](https://gitter.im/freechat-project/Verum-Backend?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
Backend Node.JS module for Verum.

[NPM](https://npmjs.org/~scratso/verum)

## Overview

The Verum NodeJS module is a combination of two different JavaScript classes: `Client` and `Server`. See the below sections for in-depth explanations of each class, their methods, events, et cetera.

Please be aware that there may be more methods than are described in these docs that are used internally by Verum. You would be advised to check the source methods if these do not satisfy your needs.

## Server

The `Server` class, which is what is used to set up a new Verum Node, is (ironically) the simpler of the two clients -- especially for developers. It exposes a total of four methods, on top of the standard constructor (most users are not expected to use three of the methods provided).

An example Server script (this is as simple as it gets, and it doesn't get much more complex):
```js
const verumServ = require("verum").Server; // import the Server class from the verum module.
var serv = new verumServ(); // create a new Verum Server object, assigned to `serv`
serv.websock.listen(); // start listening
```

### `new Server (port=9873, config={public: true, source: "https://github.com/freechat-project/Verum-Server"})`

When creating a new instance of this class, the constructor accepts two parameters:

- **port** [`int`] _(defaults to 9873)_ - this is the port that the Verum Node will listen on
- **config** [`object`] _(defaults to null)_ - a value of `null` will make Verum resort to its default configuration settings, or an object with the fields below may be used (**all fields are required**, as the default config will be used if any are missing):
  - **public** [`boolean`] _(defaults to true)_ - whether or not users may register to the Node or not. Most Nodes should be `true` here, to allow new users.
  - **source** [`string`] _(defaults to https://github.com/freechat-project/Verum-Server)_ - a url to where the Node's source may be found; used for easy compliancy with the GNU AGPL.

### `Server.listen()`

This method does not accept any parameters, and will start the server listening on the port specified in the class construction.

### `Server.saveData()`

This is an internal method used to save user data to `users.json` and configuration data to `conf.json`. While `verum.Server` does not read `conf.json`, its output can be useful to persist config data. (asynchronous)

This method accepts no parameters, and is automatically called every five minutes.

## Client

The `Client` class is significantly more advanced in functionality than the rather simplistic (to use) `Server` class, and is used to create a Verum-Compliant client to communicate with a Verum Node.

**All Client events (event handler exposed as `Client.Events`) should be handled in clients.**

### `new Client (nodeAddr, nodePort=null)`

This class accepts the following parameters when being constructed:

- **nodeAddr** [`string`] _(required)_ - this is the internet address of the Node, and may be either an IP address (eg, `123.123.123.123`) or a domain name that points to an IP address (eg, `node.verum.damianheaton.com`)
- **nodePort** [`int` or `null`] _(defaults to null)_ - this is the port number that the Node listens on. A value of `null` (or, for that matter, anything not `true`y (0, -1, etc)) will default to `9873`.

The Client will automatically connect to the server on creation (unless this isn't possible, in which case the Client will basically sit there trying to connect: a timeout check is advised).

### `Client.register (username, password, publicKey)`

This will attempt to register a new user `username` with a password of `password` on the Node, assigning it a public key of `publicKey`. All parameters are required.

An `error` Event will be raised by the Node if a user already exists with that username (`User Already Exists`) or the Node is not set to public (`Private Node`).

A `registered` Event will be raised by the Node once / if the registration is successful.

### `Client.updatePubKey (username, password, publicKey)`

This will attempt to change the public key attached to your account on the Node to `publicKey`. All values are required, and `password` is used to authorise the action on your account.

An `error` Event will be raised by the Node if the password does not match the one associated with your Node account (`Incorrect Password`) or if a user with the `username` does not exist on the Node (`User Doesn't Exist`).

An `updated` Event will be raised by the Node if / when the public key is updated.

### `Client.sendEncMsg (recipient, message, from, secretKey)`

This will attempt to encrypt and send `message` to the `recipient` (should be a string of form _user_@_node_, as these are parsed to determine Node connection details), with a header detailing that `from` sent it.

`from` **MUST** be your Verum ID (of form _user_@_node_) which is associated with the `secretKey`'s public key. `secretKey` is used to sign the message, as the recipient's client will use your account's associated public key to verify that the message truly came from you and not a spoofed header. Clients are generally advised to treat spoofed headers as spam or malicious.

This method will automatically get the recipient's public key for encryption.

The Node may raise an `error` Event if the recipient could not be found on the Node (`User Doesn't Exist`).

The Node will raise a `message_sent` Event if / when the message has been sent (however, there is **no notification** of when the Recipient retrieves or reads the message; `sent` Events are raised when the Node has logged the message.)

### `Client.getEncMsgs (username, password)`

This will attempt to retrieve your unread messages from the Node, authorised by your `username` and `password` provided. Be aware that, once the messages are retrieved, all compliant clients will report the retrieval to the Node, to which all compliant Nodes will subsequently **permanently delete the messages**. (This method does this process for you.)

This method **DOES NOT** decrypt or verify the signature of any messages: this should be done by the larger client, as Verum attempts to avoid Secret Keys as much as possible (partly for security, partly for simplicity).

The Node may raise an `error` Event if the password is incorrect (`Incorrect Password`) or if the user does not exist on the Node (`User Doesn't Exist`).

For each message that is retrieved from the Node, this method will emit a `message` event, providing the encrypted message data, the message sender's Verum ID, the timestamp of the message's receipt by the Node, and the sender's public key (this may be null if the public key could not be retrieved).

### `Client.Events`

This is the `Client`'s Event Handler, and will emit various Events. These Events can be found detailed below (of the format `event => arguments passed by the event`):

#### `error => title, explanation`

This event is raised whenever the Node encounters an error or issue which means that it cannot complete the task requested. `title` is a very short error 'code' (human readable), which is advised for use in a `switch` statement, for example. `explanation` is a longer explanation of the error, which may be displayed to the user (or ignored, if you want); this is provided by the Node.

See each different error `title` and what it means:

##### `Bad Format`

This error means that the JSON string that was sent by the client could not be parsed by the Node. This usually doesn't occur when using the standard Client methods described previously.

##### `User Doesn't Exist`

This error means that the username provided for an operation could not be found on the Node. Common causes are that the username was misspelt, or that the user is querying the wrong Node.

##### `Incorrect Password`

This error means that the password provided for an authenticated operation did not match the password attached to the operative account. Common causes are a misspelling of the password.

##### `Private Node`

This error occurs when a client attempts to register a new user on a Node which has the `public` configuration setting set to `false`, making it private. Such Nodes do not accept new registrations.

#### `welcome => node_source_url`

This Event is raised when the Node intimates that the connection has been successfully established, providing the URL to the source code of the Node. The URL is provided for compliance with the GNU AGPL.

#### `registered => welcome_msg`

This Event is raised when the Client has successfully registered a new account on the Node, which in turn provides a welcome message. This message may be ignored if wished, but sometimes may include quite important information (restart times for the Node, for example, may sometimes be provided here [though is better on the Node's official website, if applicable]).

#### `message_sent => sent_msg`

This Event is raised when a message sent by the Client has been successfully received by the recipient's Node.

#### `message => encrypted_message_data, message_sender_id, message_timestamp, message_sender_pubkey`

This Event is raised when a message is received from the Node (after the client has requested them). `message_sender_id` is the message's sender's Verum ID, of the form _user_@_node_. `message_timestamp` is the timestamp of when the Node received the message. `message_sender_pubkey` is the public key of the message sender, used for verifying the signature of the encrypted message data -- be aware, however, that this may be `null` if the public key could not be retrieved.

Unverified signatures on messages, or unsigned messages, should usually be treated as spam, as they may be spoofed `from` headers!
