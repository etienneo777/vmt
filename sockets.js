const controllers = require('./controllers')

const sockets = {};
sockets.init = server => {

    const io = require('socket.io')(server, {wsEngine: 'ws'});

    io.sockets.on('connection', socket => {

      socket.on('JOIN_TEMP', async (data, callback) => {
        socket.join(data.roomId, async () => {
          let user;
          let promises = [];
          // If the user is NOT logged in, create a temp user
          if (!data.userId) {
            try{ 
              user = await controllers.user.post({username: data.username, accountType: 'temp',});            
            } catch(err) {console.log(err)}
          } else {
            user = {_id: data.userId, username: data.username}
          }
          const message = {
            user: {_id: user._id, username: 'VMTbot'},
            room: data.roomId,
            text: `${data.username} joined ${data.roomName}`,
            autogenerated: true,
            timestamp: new Date().getTime(),
          }
          promises.push(controllers.messages.post(message))
          // If this is the user in the room, update the blank room created from "Try out a Workspace"
          // We will use the existance if the creator field to check if this is firstEntry on the front end
          if (data.firstEntry) {
            promises.push(controllers.rooms.put(data.roomId, {
              roomType: data.roomType,
              name: data.roomName,
              members: [{user: user._id, role: 'facilitator'}],
              currentMembers: [{user: user._id, socket: socket.id}],
              creator: user._id,
            }));
          } else {
            promises.push(controllers.rooms.addCurrentUsers(data.roomId, 
              {user: user._id, socket: socket.id}, 
              {user: user._id, role: 'participant'}
            )) //)
          }
          let results;
          try {
            results = await Promise.all(promises)
            socket.to(data.roomId).emit('USER_JOINED', {currentMembers: results[1].currentMembers, message,});
            callback({room: results[1], message, user,}, null)
          } catch(err) {console.log(err)}
        })
      })

      socket.on('JOIN', async (data, callback) => {
        let promises = [];
        let user = {_id: data.userId, username: data.username}

        socket.join(data.roomId, async () => {
          // update current users of this room
          let message = {
            user: {_id: data.userId, username: 'VMTbot'},
            room: data.roomId,
            text: `${data.username} joined ${data.roomName}`,
            autogenerated: true,
            timestamp: new Date().getTime(),
          }
          promises.push(controllers.messages.post(message))
          promises.push(controllers.rooms.addCurrentUsers(data.roomId, {user: data.userId, socket: socket.id})) //
          let results;
          try {
            results = await Promise.all(promises)
          }
          catch(err) {
            return callback(null, err)
          }
          socket.to(data.roomId).emit('USER_JOINED', {currentMembers: results[1].currentMembers, message,});
          // let room = {...results[1]}
          // room.chat.push(message)
          callback({room: results[1], message, user,}, null)
            // io.in(data.roomId).emit('RECEIVE_MESSAGE', message)
        })
      });

      socket.on('disconnecting', () => {
        rooms = Object.keys(socket.rooms).slice(1)
        controllers.rooms.removeCurrentUsers(rooms[0], socket.id)
        .then(res => {
          let removedMember = {};
          let currentMembers = res.currentMembers.filter(member => {
            if (member.socket === socket.id) {
              removedMember = member;
              return false;
            } return true;
          })
          let message = {
            user: {_id: removedMember.user._id, username: 'VMTBot'},
            room: rooms[0],
            text: `${removedMember.user.username} left the room`,
            autogenerated: true,
            timestamp: new Date().getTime(),
          }
          controllers.messages.post(message)
          socket.to(rooms[0]).emit('RECEIVE_MESSAGE', message) //@TODO WE SHOLD COMBINE THIS INTO ONE EMIT
          socket.to(rooms[0]).emit('USER_LEFT', {currentMembers,})
        })
        .catch(err => console.log("ERR: ",err))
      })

      socket.on('disconnect', () => {

      })

      socket.on('SEND_MESSAGE', (data, callback) => {
        const postData = {...data}
        postData.user = postData.user._id;
        controllers.messages.post(postData)
        .then(res => {
          socket.broadcast.to(data.room).emit('RECEIVE_MESSAGE', data);
          callback('success', null)
        })
        .catch(err => {
          callback('fail', err)
        })
      })

      socket.on('TAKE_CONTROL', (data, callback) => {
        let message = {
          user: {_id: data.user._id, username: 'VMTBot'},
          room: data.roomId,
          text: `${data.user.username} took control`,
          autogenerated: true,
          timestamp: new Date().getTime(),
        }
        controllers.messages.post(message)
        socket.to(data.roomId).emit('TOOK_CONTROL', {message});
        callback(null, message)
      })

      socket.on('RELEASE_CONTROL', (data, callback) => {
        let message = {
          user: {_id: data.user._id, username: 'VMTBot'},
          room: data.roomId,
          text: `${data.user.username} released control`,
          autogenerated: true,
          timestamp: new Date().getTime(),
        }
        controllers.messages.post(message)
        socket.to(data.roomId).emit('RELEASED_CONTROL', {message});
        callback(null, message)
      })

      socket.on('SEND_EVENT', async (data) => {
        if (typeof data.event !== 'string') {
          data.event = JSON.stringify(data.event)
        }
        try {
          await controllers.rooms.put(data.room, {currentState: data.currentState})
        }
        catch(err) {console.log('err 1: ', err)}
        delete  data.currentState;
        try {
          await controllers.events.post(data)
        }
        catch(err) {console.log('err 2: ', err)}
        socket.broadcast.to(data.room).emit('RECEIVE_EVENT', data)
      })
    });

}

module.exports = sockets;
