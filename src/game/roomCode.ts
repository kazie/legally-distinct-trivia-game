/** Letters that are hard to confuse with each other when read off a TV screen. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const ROOM_CODE_LENGTH = 4

export function generateRoomCode(random: () => number = Math.random): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join('')
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH)
}

export function roomTopic(roomCode: string): string {
  return `ldtg/room/${roomCode}`
}
