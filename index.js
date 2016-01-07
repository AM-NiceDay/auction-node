'use strict';

var port = process.env.PORT || 8000;
var io = require('socket.io')(port);
console.log('Running on port ' + port);
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
  playersPoints: mongoose.Schema.Types.Mixed,
  things: [String],
  currentThing: String,
  currentPrice: Number,
  isOver: { type: Boolean, default: false },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  joker: Number,
  jokerUsed: Boolean,
  difference: Number
});

GameSchema.pre('save', function(next) {
  this.playersPoints = calculatePlayersPoints(this.playersStats);
  next();
});

var Game = mongoose.model('Game', GameSchema);

io.on('connection', function (socket) {
  console.log('host connected');

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
        return Room.findOne({ _id: action.roomId })
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
            socket.emit('ROOM_JOINED');
            socket.broadcast.emit('UPDATE_ROOM', room);
          });
      }
      case 'GET_ROOM': {
        return Room.findOne({ _id: action.roomId })
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
        return Room.findOne({ _id: action.roomId })
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
              currentPrice: 100,
              joker: Math.floor(Math.random() * (10)) + 1,
              jokerUsed: false,
              difference: 0
            });
          })
          .then(function(game) {
            socket.emit('GAME_STARTED', action.roomId, game._id);
            socket.broadcast.emit('GAME_STARTED', action.roomId, game._id);
          })
          .then(function() {
            return Room.remove({ _id: action.roomId });
          });
      }
      case 'GET_GAME': {
        return Game.findOne({ _id: action.gameId })
          .populate('owner players winner')
          .exec()
          .then(function(game) {
            socket.emit('UPDATE_GAME', game);
          });
      }
      case 'REMOVE_GAME': {
        return Game.remove({ _id: action.gameId })
          .then(function() {
            socket.emit('GAME_REMOVED', action.gameId);
            socket.broadcast.emit('GAME_REMOVED', action.gameId);
          });
      }
      case 'NEXT_TICK': {
        return Game.findOne({ _id: action.gameId })
          .populate('owner players winner')
          .exec()
          .then(function(game) {
            var currentPrice = game.currentPrice;
            var difference = Math.floor(Math.random() * (10)) + 1;
            var nextPrice = currentPrice - difference;

            if (nextPrice > 0) {
              game.currentPrice = nextPrice;
              game.difference = difference;
            } else if (game.things.length > 0) {
              game.currentThing = game.things[0];
              game.things = game.things.slice(1);
              game.currentPrice = 100;
              if (game.jokerUsed == true) {
                game.joker = Math.floor(Math.random() * (10)) + 1;
                game.jokerUsed = false;
              }
            } else {
              game.isOver = true;
              game.winner = calculateWinner(game.players, game.playersPoints);
              game.currentThing = '';
              game.currentPrice = 0;
            }

            return game;
          })
          .then(function(game) {
            return game.save();
          })
          .then(function(game) {
            socket.emit('UPDATE_GAME', game);
            socket.broadcast.emit('UPDATE_GAME', game);
          });
      }
      case 'BUY_THING': {
        return Game.findOne({ _id: action.gameId })
          .populate('owner players winner')
          .exec()
          .then(function(game) {
            var playerStats = game.playersStats[action.playerId];

            var isJoker = game.joker == game.difference;
            if (isJoker) {
              game.jokerUsed = true;
            }
            var totalPrice = isJoker ? 0 : game.currentPrice;

            if (playerStats.money < totalPrice) {
              return game;
            }

            game.playersStats[action.playerId].things.push(game.currentThing);
            game.playersStats[action.playerId].money -= totalPrice;
            game.markModified('playersStats');

            if (game.things.length > 0) {
              game.currentThing = game.things[0];
              game.things = game.things.slice(1);
              game.currentPrice = 100;
              if (game.jokerUsed == true) {
                game.joker = Math.floor(Math.random() * (10)) + 1;
                game.jokerUsed = false;
              }
            } else {
              game.isOver = true;
              game.winner = calculateWinner(game.players, game.playersPoints);
              game.currentThing = '';
              game.currentPrice = 0;
            }

            return game;
          })
          .then(function(game) {
            return game.save();
          })
          .then(function(game) {
            socket.emit('UPDATE_GAME', game);
            socket.broadcast.emit('UPDATE_GAME', game);
          });
      }
      case 'BUY_JOKER': {
        return Game.findOne({ _id: action.gameId })
          .populate('owner players winner')
          .exec()
          .then(function(game) {
            var playerStats = game.playersStats[action.playerId];

            if (playerStats.money < 30) {
              return game;
            }

            game.playersStats[action.playerId].money -= 30;
            game.joker = action.joker;
            game.jokerUsed = false;

            game.markModified('playersStats');

            return game;
          })
          .then(function(game) {
            return game.save();
          })
          .then(function(game) {
            socket.emit('UPDATE_GAME', game);
            socket.broadcast.emit('UPDATE_GAME', game);
          });
      }
      case 'GET_CURRENT_WINNER': {
        Game.findOne({ _id: action.gameId })
          .populate('owner players winner')
          .exec()
          .then(function(game) {
            socket.emit('UPDATE_GAME', socket.emit('UPDATE_CURRENT_WINNER',
              calculateWinner(game.players, game.playersPoints)));
          });
      }
    }
  });
});

function generateThings(amount) {
  var things = ['🎩', '🚙', '🚔', '⛴', '✈️', '🏠', '🚞', '🚝', '☂', '💼', '🕶', '👔', '🎓'];

  return things.slice(0, amount);
}

function calculateWinner(players, playersPoints) {
  var winnerValue = _.chain(playersPoints).values().max().value();
  var winnerId;
  for (var key in playersPoints) {
    if (playersPoints[key] === winnerValue) {
      winnerId = key;
      break;
    }
  }

  var winnerIndex = _.findIndex(players, function(player) {
    return player._id == winnerId;
  });

  return players[winnerIndex];
}

function calculatePlayersPoints(playersStats) {
  return _.mapValues(playersStats, function(playerStats) {
    return playerStats.things.length * 35 + calculateSigma(playerStats.things.length * 5, 0) + playerStats.money;
  });
}

function calculateSigma(n, acc) {
  if (n > 0) {
    var newAcc = acc + n;
    return calculateSigma(n - 1, newAcc);
  }

  return acc;
}
