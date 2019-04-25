const controllers = require('./controllers');
const _ = require('lodash');
const parseString = require('xml2js').parseString;
const socketInit = require('./socketInit');
const ObjectId = require('mongoose').Types.ObjectId;

// const io = require('socket.io')(server, {wsEngine: 'ws'});
module.exports = function() {
  const io = socketInit.io;

  io.use((socket, next) => {
    next();
    // console.log("in the middle ware");
    // console.log(socket.request);
    // @TODO Authentication
    // look here https://stackoverflow.com/questions/13095418/how-to-use-passport-with-express-and-socket-io
  });

  io.sockets.on('connection', socket => {
    // console.log(socket.getEventNames())

    socket.on('JOIN_TEMP', async (data, callback) => {
      socket.join(data.roomId, async () => {
        let user;
        let promises = [];
        // If the user is NOT logged in, create a temp user
        if (!data.userId) {
          try {
            user = await controllers.user.post({
              username: data.username,
              accountType: 'temp',
            });
          } catch (err) {
            console.log('Error creating user ', err);
          }
        } else {
          user = { _id: data.userId, username: data.username };
        }
        socket.user_id = user._id; // store the user id on the socket so we can tell who comes and who goes
        socket.username = user.username;
        const message = {
          user: { _id: user._id, username: 'VMTbot' },
          room: data.roomId,
          messageType: 'JOINED_ROOM',
          text: `${data.username} joined ${data.roomName}`,
          color: data.color,
          autogenerated: true,
          timestamp: new Date().getTime(),
        };
        promises.push(controllers.messages.post(message));
        // If this is the user in the room, update the blank room created from "Try out a Workspace"
        // We will use the existance if the creator field to check if this is firstEntry on the front end
        if (data.firstEntry) {
          promises.push(
            controllers.tabs.put(data.tabId, { tabType: data.roomType })
          );
          promises.push(
            controllers.rooms.put(data.roomId, {
              roomType: data.roomType,
              name: data.roomName,
              // members: [{ user: user._id, role: "facilitator" }],
              // currentMembers: [user._id],
              creator: user._id,
            })
          );
        }
        promises.push(
          controllers.rooms.addCurrentUsers(data.roomId, ObjectId(user._id), {
            user: ObjectId(user._id),
            role: data.firstEntry ? 'facilitator' : 'participant',
            color: data.color,
          })
        );
        let results;
        try {
          results = await Promise.all(promises);
          socket.to(data.roomId).emit('USER_JOINED_TEMP', {
            currentMembers: results[results.length - 1].currentMembers,
            members: results[results.length - 1].members,
            message,
          });
          callback({ room: results[results.length - 1], message, user }, null);
        } catch (err) {
          console.log(err);
        }
      });
    });

    socket.on('JOIN', async (data, callback) => {
      socket.user_id = data.userId; // store the user id on the socket so we can tell who comes and who goes
      socket.username = data.username;
      let promises = [];
      let user = { _id: data.userId, username: data.username };

      socket.join(data.roomId, async () => {
        // update current users of this room
        let message = {
          user: { _id: data.userId, username: 'VMTbot' },
          room: data.roomId,
          text: `${data.username} joined ${data.roomName}`,
          autogenerated: true,
          messageType: 'JOINED_ROOM',
          color: data.color,
          timestamp: new Date().getTime(),
        };
        promises.push(controllers.messages.post(message));
        promises.push(
          controllers.rooms.addCurrentUsers(data.roomId, data.userId)
        ); //
        let results;
        try {
          results = await Promise.all(promises);
          console.log('CURRENT MEMBERS SHOULD BE POPULATED');
          console.log(results[1].currentMembers);
          socket.to(data.roomId).emit('USER_JOINED', {
            currentMembers: results[1].currentMembers,
            message,
          });
          callback({ room: results[1], message, user }, null);
        } catch (err) {
          console.log('ERROR: ', err);
          return callback(null, err);
        }
      });
    });

    socket.on('LEAVE_ROOM', (color, cb) => {
      leaveRoom(cb);
    });

    socket.on('disconnecting', () => {
      // if they're in a room we need to remove them
      let room = Object.keys(socket.rooms).pop(); // they can only be in one room so just grab the last one
      if (room && ObjectId.isValid(room)) {
        leaveRoom();
      }
    });

    socket.on('disconnect', () => {
      console.log('socket disconnect');
    });

    socket.on('SYNC_SOCKET', (data, cb) => {
      let { userId, socketId } = data;
      if (!userId) {
        return;
      }
      controllers.user
        .put(userId, { socketId: socketId })
        .then(user => {
          cb('User socketId updated', null);
        })
        .catch(err => cb(null, err));
    });

    socket.on('SEND_MESSAGE', (data, callback) => {
      let postData = { ...data };
      postData.user = postData.user._id;
      controllers.messages
        .post(postData)
        .then(res => {
          socket.broadcast
            .to(data.room)
            .emit('RECEIVE_MESSAGE', { ...data, _id: res._id });
          callback(res, null);
        })
        .catch(err => {
          callback('fail', err);
        });
    });

    socket.on('TAKE_CONTROL', async (data, callback) => {
      try {
        await Promise.all([
          controllers.messages.post(data),
          controllers.rooms.put(data.room, { controlledBy: data.user._id }),
        ]);
      } catch (err) {
        console.log('ERROR TAKING CONTROL: ', err);
        callback(err, null);
      }
      socket.to(data.room).emit('TOOK_CONTROL', data);
      callback(null, data);
    });

    socket.on('RELEASE_CONTROL', (data, callback) => {
      controllers.messages.post(data);
      controllers.rooms.put(data.room, { controlledBy: null });
      socket.to(data.room).emit('RELEASED_CONTROL', data);
      callback(null, {});
    });

    socket.on('SEND_EVENT', async data => {
      socket.broadcast.to(data.room).emit('RECEIVE_EVENT', data);
      let xmlObj = '';
      if (data.xml && data.eventType !== 'CHANGE_PERSPECTIVE') {
        xmlObj = await parseXML(xml); // @TODO We should do this parsing on the backend yeah? we only need this for to build the description which we only need in the replayer anyway
      }
      try {
        await controllers.events.post(data);
        // data.currentState = currentState;
      } catch (err) {
        console.log('err 2: ', err);
      }
    });

    socket.on('SWITCH_TAB', (data, callback) => {
      controllers.messages
        .post(data)
        .then(res => {
          socket.broadcast.to(data.room).emit('RECEIVE_MESSAGE', data);
          callback('sucess', null);
        })
        .catch(err => {
          callback(null, err);
        });
    });

    socket.on('NEW_TAB', (data, callback) => {
      controllers.messages
        .post(data.message)
        .then(res => {
          socket.broadcast.to(data.message.room).emit('CREATED_TAB', data);
          callback('success');
        })
        .catch(err => callback('fail', err));
    });

    const leaveRoom = function(color, cb) {
      room = Object.keys(socket.rooms).pop();
      controllers.rooms
        .removeCurrentUsers(room, socket.user_id)
        .then(res => {
          let removedMember = {};
          if (res && res.currentMembers) {
            let currentMembers = res.currentMembers.filter(member => {
              if (socket.user_id.toString() === member._id.toString()) {
                removedMember = member;
                return false;
              }
              return true;
            });
            let message = {
              color,
              room,
              user: { _id: removedMember._id, username: 'VMTBot' },
              text: `${removedMember.username} left the room`,
              messageType: 'LEFT_ROOM',
              autogenerated: true,
              timestamp: new Date().getTime(),
            };
            let releasedControl = false;
            // parse to string becayse it is an objectId
            if (
              res.controlledBy &&
              res.controlledBy.toString() === socket.user_id
            ) {
              controllers.rooms.put(room, { controlledBy: null });
              releasedControl = true;
            }
            controllers.messages.post(message);
            socket
              .to(room)
              .emit('USER_LEFT', { currentMembers, releasedControl, message });
            // delete socket.rooms;
            // This function can be invoked by the LEAVE_ROOM handler or by disconnecting...in the case of disconnecting
            // there is no callback because
            if (cb) {
              return cb('exited!', null);
            }
          }
        })
        .catch(err => {
          if (cb) cb(null, err);
        });
    };
  });
};

const parseXML = xml => {
  return new Promise((resolve, reject) => {
    parseString(xml, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
  });
};
