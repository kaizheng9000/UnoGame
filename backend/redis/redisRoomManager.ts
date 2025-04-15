import Player from 'backend/models/player';
import UnoRoom from 'backend/models/unoRoom';
import Redis from 'ioredis';

export class RedisRoomManager {
  private redis: Redis;

  constructor(redisInstance: Redis) {
    this.redis = redisInstance;
  }

  async createRoom(roomCode: string): Promise<void> {
    await this.redis.sadd('uno:rooms', roomCode);
  }

  async deleteRoom(roomCode: string): Promise<void> {
    await this.redis.multi()
      .srem('uno:rooms', roomCode)
      .del(`uno:room:${roomCode}:players`)
      .del(`uno:room:${roomCode}:state`)
      .exec();
  }

  async addPlayer(roomCode: string, player: Player): Promise<void> {
    await this.redis.rpush(`uno:room:${roomCode}:players`, JSON.stringify(player));
  }

  async removePlayer(roomCode: string, playerId: string): Promise<void> {
    const players = await this.getPlayers(roomCode);
    const filtered = players.filter(p => p.id !== playerId);
    await this.redis.del(`uno:room:${roomCode}:players`);
    if (filtered.length > 0) {
      await this.redis.rpush(
        `uno:room:${roomCode}:players`,
        ...filtered.map(p => JSON.stringify(p))
      );
    }
  }

  async getPlayers(roomCode: string): Promise<Player[]> {
    const raw = await this.redis.lrange(`uno:room:${roomCode}:players`, 0, -1);
    return raw.map(p => JSON.parse(p));
  }

  async saveGameState(roomCode: string, state: UnoRoom): Promise<void> {
    await this.redis.set(`uno:room:${roomCode}:state`, JSON.stringify(state));
  }

  async getGameState(roomCode: string): Promise<UnoRoom | null> {
    const raw = await this.redis.get(`uno:room:${roomCode}:state`);
    return raw ? JSON.parse(raw) : null;
  }

  async setTTL(roomCode: string, seconds: number): Promise<void> {
    await this.redis.expire(`uno:room:${roomCode}:state`, seconds);
    await this.redis.expire(`uno:room:${roomCode}:players`, seconds);
  }

  async getAllRooms(): Promise<string[]> {
    return await this.redis.smembers('uno:rooms');
  }
}
