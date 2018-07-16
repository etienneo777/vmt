const controllers = require('./controllers')

const sockets = {};
sockets.init = server => {

    var io = require('socket.io').listen(server);
    io.sockets.on('connection', socket => {
      // client joins room ==> update other clients room list
      socket.on('JOIN', data => {
        console.log('Joinin socket')
        socket.join(data.room.id, () => {
          console.log('socket.join')
          // update current users of this room
          controllers.room.addCurrentUsers(data.room.id, data.user.id)
          .then(room => console.log(room))
          .catch(err => console.log(err))
          // emit to other clients
          console.log('new user joind emit other clients')
          socket.broadcast.to(data.room.id).emit('NEW_USER', data.user.name)
        })
        // emit to the clients we've got a new user
      });
      // Message sent from a client to be dispatched to the other clients
      // in that room
      socket.on('LEAVE_ROOM', data => {
        console.log('DISCONNECTING FROM SOCKETS')
        socket.leave(data.roomId, () => {
          controllers.room.removeCurrentUsers(data.roomId, data.userId)
          .then(room => {
            console.log("room after disconnect: ",room);
            socket.broadcast.to(data.roomId).emit('USER_LEFT', room.currentUsers);
          })
          .catch(err => console.log(err))
        })
      })
      socket.on('SEND_MESSAGE', data => new Promise(function(resolve, reject) {
        // when we fetch the message we populate the user field
        // below we are essentially de-populating it, i.e., setting user to
        // userId again
        const username = data.user.username;
        const userId = data.user.userId
        data.user = data.user.userId;
        controllers.message.post(data)
        .then(res => {
          // and then re-populate ==> theres probably a better way to do this
          data.user = {username, userId,}
          socket.broadcast.to(data.room).emit('RECEIVE_MESSAGE', data);
        })
        .catch(err => console.log(err))
        // broadcast new message
      }))

      socket.on('SEND_EVENT', data => new Promise((resolve, reject) => {
        controllers.event.post(data)
        // console.log(io.sockets.clients(data.roomId))
        socket.broadcast.to(data.room).emit('RECEIVE_EVENT', data.event)
      }))
    });

}

module.exports = sockets;
