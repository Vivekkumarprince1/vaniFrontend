import React from 'react'
 // Fetch users
 const fetchUsers = async () => {
    try {
        const res = await axios.get(`${API_URL}/api/auth/users`);
        // Filter out current user
        const filteredUsers = res.data.filter(u => u._id !== user?.id);
        setUsers(filteredUsers.map(u => ({
            id: u._id,
            name: u.username,
            socketId: u.socketId // If available from your API
        })));
    } catch (error) {
        console.error('Error fetching users:', error);
    }
};

const Users = () => {
  return (
    <div>
      <div className="sidebar">
                    <div className="users-section">
                        <h2>Users</h2>
                        <ul>
                            {users.map(user => (
                                <li
                                    key={user.id}
                                    className={selectedUser?.id === user.id ? 'selected' : ''}
                                    onClick={() => selectUser(user)}
                                >
                                    {user.name}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="rooms-section">
                        <h2>Rooms</h2>
                        <button onClick={createRoom}>Create Room</button>
                        <ul>
                            {rooms.map(room => (
                                <li
                                    key={room}
                                    className={selectedRoom === room ? 'selected' : ''}
                                    onClick={() => selectRoom(room)}
                                >
                                    {room}
                                </li>
                            ))}
                        </ul>
                    </div>
                    </div>
    </div>
  )
}

export default Users
