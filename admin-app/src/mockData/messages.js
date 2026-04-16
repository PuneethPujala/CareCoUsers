export const mockMessages = [
    {
        id: 1,
        sender: 'Sarah Johnson',
        role: 'Caretaker',
        avatar: 'https://i.pravatar.cc/150?img=25',
        lastMessage: 'Just checking in - did you take your morning meds?',
        timestamp: '10:30 AM',
        unread: 2,
        online: true,
    },
    {
        id: 2,
        sender: 'Dr. Smith',
        role: 'Doctor',
        avatar: 'https://i.pravatar.cc/150?img=11',
        lastMessage: 'Your test results look good. Keep it up!',
        timestamp: 'Yesterday',
        unread: 0,
        online: false,
    },
    {
        id: 3,
        sender: 'Support Team',
        role: 'Admin',
        avatar: '',
        lastMessage: 'Ticket #4291 has been resolved.',
        timestamp: '2 days ago',
        unread: 0,
        online: true,
    }
];

export const mockChatHistory = [
    { id: 1, sender: 'Sarah Johnson', text: 'Good morning, John! How are you feeling today?', time: '09:00 AM', isMe: false },
    { id: 2, sender: 'Me', text: 'I am feeling much better, thank you Sarah.', time: '09:05 AM', isMe: true },
    { id: 3, sender: 'Sarah Johnson', text: 'Great to hear! Don\'t forget your 10 AM appointment.', time: '09:06 AM', isMe: false },
    { id: 4, sender: 'Me', text: 'Will do. Thanks for the reminder.', time: '09:07 AM', isMe: true },
];
