import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

import { env } from "../env.js";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(env.redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  }

  private async ensureConnected(): Promise<Redis> {
    if (this.client.status === "wait") {
      await this.client.connect();
    }

    return this.client;
  }

  async get(key: string): Promise<string | null> {
    const client = await this.ensureConnected();
    return client.get(key);
  }

  async ttl(key: string): Promise<number> {
    const client = await this.ensureConnected();
    return client.ttl(key);
  }

  async incr(key: string): Promise<number> {
    const client = await this.ensureConnected();
    return client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    const client = await this.ensureConnected();
    return client.expire(key, seconds);
  }

  async set(key: string, value: string, seconds?: number): Promise<void> {
    const client = await this.ensureConnected();
    if (typeof seconds === "number" && seconds > 0) {
      await client.set(key, value, "EX", seconds);
      return;
    }

    await client.set(key, value);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    const client = await this.ensureConnected();
    return client.del(...keys);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== "end") {
      await this.client.quit();
    }
  }
}
