var io = require('socket.io')(8000);

var room = {
  players: []
};

var game = {};

io.on('connection', function (socket) {
  socket.on('action', function(action) {
    switch(action.type) {
      case 'CREATE_ROOM': {
        room.owner = action.owner;
        room.players = [];
        break;
      }
      case 'JOIN_ROOM': {
        room.players.push(action.player);
        break;
      }
      case 'GET_ROOM': {
        socket.emit('UPDATE_ROOM', room);
        break;
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
