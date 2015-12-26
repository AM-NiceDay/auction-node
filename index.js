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
          players: room.players.slice(),
          owner: room.owner
        };

        socket.broadcast.emit('GAME_STARTED', game);
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