var io = require('socket.io')(8000);
var mongoose = require('mongoose');

mongoose.connect('localhost:27017/auction');

var UserSchema = mongoose.Schema({
  name: String
});

var User = mongoose.model('User', UserSchema);

var RoomSchema = mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

var Room = mongoose.model('Room', RoomSchema);

var room = {
  players: []
};

var game = {};

io.on('connection', function (socket) {
  socket.on('action', function(action) {
    switch(action.type) {
      case 'CREATE_USER': {
        return User.findOne({
          name: action.name
        })
          .then(function(user) {
            if (!user) {
              return User.create({
                name: action.name
              });
            }

            return user;
          })
          .then(function(user) {
            socket.emit('UPDATE_USER', {
              id: user._id,
              name: user.name
            });
          });
      }
      case 'CREATE_ROOM': {
        return Room.create({
          owner: action.owner.id
        })
          .then(function(room) {
            socket.emit('ROOM_CREATED', room.id);
          });
      }
      case 'JOIN_ROOM': {
        room.players.push(action.player);
        break;
      }
      case 'GET_ROOM': {
        return Room.findOne(action.roomId)
          .populate('owner players')
          .exec()
          .then(function(room) {
            socket.emit('UPDATE_ROOM', room);
          });
      }
      case 'GET_ROOMS': {
        return Room.find()
          .then(function(rooms) {
            socket.emit('UPDATE_ROOMS', rooms);
          });
      }
      case 'START_GAME': {
        game = {
          players: setupPlayers(room.players.slice()),
          owner: room.owner,
          things: calculateThings(room.players.length)
        };

        socket.broadcast.emit('GAME_STARTED', game);
        break;
      }
      case 'GET_GAME': {
        socket.emit('UPDATE_GAME', game);
        break;
      }
    }

    if (action.type === 'CREATE_ROOM'
      || action.type === 'JOIN_ROOM') {
      socket.broadcast.emit('UPDATE_ROOM', room);
    }

    console.log(room);
    console.log(game);
  });
});

function setupPlayers(players) {
  var result = [];

  for (var index in players) {
    result.push({
      name: players[index],
      money: 100,
      things: []
    });
  }

  return result;
}

function calculateThings(numberOfPlayers) {
  var result = [];
  for (var i = 0; i < numberOfPlayers; i++) {
    result.push(i * 2, i * 2 + 1);
  }

  return result;
}
