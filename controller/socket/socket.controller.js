const app = require('express');
const router = app.Router();
const GameManager = require('../../manager/game.manager');
const rooms = new Map();

const ROOM_USER_CREATE = 'room-user-create';
const ROOM_USER_DELETE = 'room-user-delete';
const ROOM_PLAYER_JOIN = 'room-player-join';
const ROOM_PLAYERS_STATUS = 'room-players-status';
const ROOM_USER_REMOVE_PLAYER = 'room-user-remove-player';
const ROOM_NOTIFY_PLAYER_ROOM_CLOSED = 'room-user-leave-notify-players';
const ROOM_NOTIFY_USER_THAT_PLAYER_LEFT = 'room-player-leave-notify-user';

const io = function(io) {
  io.on('connection', socket => {
    console.log(`Socket ${socket.id} connected.`);

    socket.on('disconnect', () => {
      console.log(`Socket ${socket.id} disconnected.`);
    });

    /**
     * create room
     */
    socket.on(ROOM_USER_CREATE, message => {
      GameManager.getGameById(message.gameId).then(game => {
        if (!game) {
          socket.emit(
            ROOM_USER_CREATE,
            generateSocketResponse(
              ROOM_USER_CREATE,
              false,
              null,
              'Hmm ... nous ne semblons pas pouvoir trouver ce quizz.',
            ),
          );
        }

        const player = {
          socketId: socket.id,
          isAdmin: true,
          ...message.user,
        };
        const roomId = generateRoomId();
        rooms.set(roomId, {
          roomId: roomId,
          game: game,
          userId: message.userId,
          socketId: socket.id,
          players: [player],
        });

        socket.emit(ROOM_USER_CREATE, generateSocketResponse(ROOM_USER_CREATE, true, getRoomById(roomId)));
      });
    });

    /**
     * delete room
     */
    socket.on(ROOM_USER_DELETE, message => {
      const room = getRoomById(message.roomId);
      // notify players
      room.players.forEach(player => {
        io.to(player.socketId).emit(
          ROOM_NOTIFY_PLAYER_ROOM_CLOSED,
          generateSocketResponse(ROOM_NOTIFY_PLAYER_ROOM_CLOSED, true, null, 'room is closed'),
        );
      });
      deleteRoomById(room.roomId);
    });

    /**
     * player join room
     */
    socket.on(ROOM_PLAYER_JOIN, message => {
      const room = getRoomById(message.roomId);

      if (room) {
        const user = message.user;
        // todo uncomment this to restrict one same username by room
        let player = room.players.find(player => player.username === user.username);
        if (player) {
          socket.emit(ROOM_PLAYER_JOIN, generateSocketResponse(ROOM_PLAYER_JOIN, false, {}, 'Player already existing'));
        } else {
          user.socketId = socket.id;
          user.isAdmin = false;
          room.players.push(user);
          socket.emit(ROOM_PLAYER_JOIN, generateSocketResponse(ROOM_PLAYER_JOIN, true, room, 'room found'));

          room.players.forEach(player => {
            io.to(player.socketId).emit(
              ROOM_PLAYERS_STATUS,
              generateSocketResponse(ROOM_PLAYERS_STATUS, true, room.players, 'new player'),
            );
          });
        }
      } else {
        // room not found
        socket.emit(
          ROOM_PLAYER_JOIN,
          generateSocketResponse(ROOM_PLAYER_JOIN, false, {}, 'Aucune salle ne correspond à ce code.'),
        );
      }
    });

    /**
     * Remove player and notify him
     */
    socket.on(ROOM_USER_REMOVE_PLAYER, message => {
      const room = getRoomById(message.roomId);
      if (room) {
        const player = room.players.find(player => player.id === message.playerId);
        if (player) {
          room.players = room.players.filter(player => player.id !== message.playerId);
          io.to(player.socketId).emit(
            ROOM_NOTIFY_PLAYER_ROOM_CLOSED,
            generateSocketResponse(
              ROOM_NOTIFY_PLAYER_ROOM_CLOSED,
              true,
              null,
              'On ta fait sortir de la salle, tu sera rediriger sur la page précédente',
            ),
          );
          room.players.forEach(player => {
            io.to(player.socketId).emit(
              ROOM_PLAYERS_STATUS,
              generateSocketResponse(ROOM_PLAYERS_STATUS, true, room.players, 'new player'),
            );
          });
        }
      }
    });

    /**
     * notify players that user close room
     */
    socket.on('room-user-leave', roomID => {
      const room = getRoomById(roomID);
      room.players.forEach(player => {
        generateSocketResponse(
          ROOM_NOTIFY_PLAYER_ROOM_CLOSED,
          true,
          null,
          "La salle a été fermée par l'utilisateur, tu sera rediriger sur la page précédente",
        );
      });
    });

    /**
     * notify user that player leave room
     */
    socket.on(ROOM_NOTIFY_USER_THAT_PLAYER_LEFT, data => {
      const room = getRoomById(data.roomId);
      if (room) {
        room.players = room.players.filter(player => player.id !== data.user.id);
        room.players.forEach(player => {
          io.to(player.socketId).emit(
            ROOM_PLAYERS_STATUS,
            generateSocketResponse(ROOM_PLAYERS_STATUS, true, room.players, 'new player'),
          );
        });
      }
    });
  });
  return router;
};

function deleteRoomById(id) {
  rooms.delete(parseInt(id));
}

function generateRoomId() {
  const min = 100;
  const max = 1000000;
  return Math.floor(Math.random() * (+max - +min)) + +min;
}

function getRoomById(id) {
  return rooms.get(parseInt(id));
}

function generateSocketResponse(action, isSuccess, data, message = '') {
  return {
    success: isSuccess,
    data: data,
    message: message,
    action: action,
  };
}

module.exports = io;

// send to specific client
// io.to(socket.id).emit('private', 'Just for you bud');

// sending to all clients except sender
// socket.broadcast.emit('create-room', 'broadcast')
//
//  send all client
// io.sockets.emit('create-room', 'test');

// send to sender
// socket.emit('create-room', message);