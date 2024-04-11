import express from 'express'
import { Server } from "socket.io"
import path from 'path'
import { fileURLToPath } from 'url'
import { get } from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3500
const ADMIN = "Admin"

const app = express()

app.use(express.static(path.join(__dirname, "public")))

const expressServer = app.listen(PORT, () => {
    console.log(`listening on port ${PORT}`)
})

// State
const UsersState = {
    users: [],
    setUsers: function(newUsersArray) {
        this.Users = newUsersArray
    }
}

const io = new Server(expressServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5500", "http://127.0.0.1:5500"]
    }
})

io.on('connection', socket => {
    console.log(`User${socket.id} connected`)

    // Upon connecction - only to user
    socket.emit('message', buildMsg(ADMIN, "Welcome to Chat App!") )

    // Upon connection
    socket.on('enterRoom', ({ name, room}) => {
        // leave previous room
        const prevRoom = getUser(socket.id)?.room

        if (prevRoom) {
            socket.leave(prevRoom)
            io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`))
        }

        const user = activateUser(socket.id, name, room)

        // Cannot update previous room users list until after the state update in activate user
        if(prevRoom) {
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        // Join room
        socket.join(user.room)

        // To user who joined
        socket.emit('message', buildMsg(ADMIN, `You have joined the ${user.room} chat room`))

        // To everyone else
        socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`))

        // Update userlist for room
        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        })

        // Update rooms list foe everyone
        io.emit('roomList', {
            users: getAllActiveRooms()
        })
    })

    // // Upon connection - to all others
    // socket.broadcast.emit('message',`User${socket.id.substring(0,5)}} connected` )

    // When user disconnects - to all others
    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeavesApp(socket.id)

        // socket.broadcast.emit('message', `User${socket.id.substring(0,5)} disconnected` )

        if (user) {
            io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room`))

            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }

        console.log(`User${socket.id} disconnected`)
    })

    // Listening for a message event
    socket.on('message', ({ name, text }) =>{
        // console.log(data)

        const room = getUser(socket.id)?.room
        if(room) {
            io.to(room).emit('message', buildMsg(name, text))
        }
        // io.emit('message', `${socket.id.substring(0,5)} : ${data}`)
    })

    
    // Listen for activity
    socket.on('activity', (name) => {
        const room = getUser(socket.id)?.room
        if(room) {
            socket.broadcast.to(room),emit('activity', name)
        }
        // socket.broadcast.emit('activity', name)
    })
})

function buildMsg(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric', 
            second: 'numeric'
        }).format(new Date())
    }
}

// User functions
function activateUser(id, name, room) {
    const user = {id, name, room}
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id !== id),
        user
    ])
    return user
}

function userLeavesApp(id) {
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id)
}

function getUsersInRoom(room) {
    return UsersState.users.filter(user => user.room === room)
}

function getAllActiveRooms() {
    return Array.from(new Set(UsersState.users.map(user => user.room)))
}