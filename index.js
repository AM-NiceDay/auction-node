'use strict';

var io = require('socket.io')(8000);
var mongoose = require('mongoose');
var _ = require('lodash');

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

var GameSchema = mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  playersStats: mongoose.Schema.Types.Mixed,
  things: [String],
  currentThing: String,
  currentPrice: Number
});

var Game = mongoose.model('Game', GameSchema);

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
        return Room.findOne(action.roomId)
          .then(function(room) {
            room.players.push(action.player.id);
            return room.save();
          })
          .then(function(room) {
            return room
              .populate('owner players')
              .execPopulate();
          })
          .then(function(room) {
            console.log(room);
            socket.emit('ROOM_JOINED');
            socket.broadcast.emit('UPDATE_ROOM', room);
          });
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
          .populate('owner')
          .then(function(rooms) {
            socket.emit('UPDATE_ROOMS', rooms);
          });
      }
      case 'START_GAME': {
        return Room.findOne(action.roomId)
          .populate('owner players')
          .exec()
          .then(function(room) {
            var playersStats = _.chain(room.players)
              .map(function(player) {
                return {
                  id: player._id,
                  name: player.name,
                  money: 100,
                  things: []
                };
              })
                .indexBy('id')
                .value();

            var things = generateThings(room.players.length * 2);
            return Game.create({
              owner: room.owner,
              players: room.players,
              playersStats: playersStats,
              currentThing: things[0],
              things: things.slice(1),
              currentPrice: 100
            });
          })
          .then(function(game) {
            socket.emit('GAME_STARTED', game._id);
            socket.broadcast.emit('GAME_STARTED', game._id);
            game(socket, game, Game);
          })
          .then(function() {
            return Room.remove({ _id: action.roomId });
          });
      }
      case 'GET_GAME': {
        return Game.findOne(action.gameId)
          .populate('owner players')
          .exec()
          .then(function(game) {
            socket.emit('UPDATE_GAME', game);
          });
      }
      case 'REMOVE_GAME': {
        return Game.remove(action.gameId)
          .then(function() {
            socket.emit('GAME_REMOVED');
            socket.broadcast.emit('GAME_REMOVED');
          });
      }
    }
  });
});

function generateThings(amount) {
  var things = ['🎩', '🚙', '🚔', '⛴', '✈️', '🏠', '🚞', '🚝', '☂', '💼', '🕶', '👔', '🎓'];

  return things.slice(0, amount);
}
