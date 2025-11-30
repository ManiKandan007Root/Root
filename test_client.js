import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Connected to server');
    
    console.log('Creating game...');
    socket.emit('createGame', 'TestHost', (response) => {
        console.log('Create Game Response:', response);
        if (response.roomCode) {
            console.log('Game created successfully!');
            process.exit(0);
        } else {
            console.error('Failed to create game');
            process.exit(1);
        }
    });
});

socket.on('connect_error', (err) => {
    console.error('Connection Error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('Timeout');
    process.exit(1);
}, 5000);
