import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { connect as connectTls, type TLSSocket } from 'node:tls';
import { connect as connectTcp, type Socket } from 'node:net';
import type {
  EmailVerificationRecord,
  LoginSession,
} from './auth';

export interface EmailSender {
  sendVerificationCode(email: string, code: string): Promise<void>;
}

export interface SmtpEmailSenderOptions {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
}

type SmtpConnection = Socket | TLSSocket;

class SmtpClient {
  private buffer = '';
  private readonly onSocketData = (chunk: Buffer | string) => this.onData(chunk.toString('utf8'));
  private pending: Array<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }> = [];

  private constructor(private readonly socket: SmtpConnection) {
    socket.on('data', this.onSocketData);
    socket.on('error', (error: Error) => this.rejectPending(error));
    socket.on('close', () => this.rejectPending(new Error('SMTP 连接已关闭。')));
  }

  static async connect(options: SmtpEmailSenderOptions): Promise<SmtpClient> {
    const socket = await new Promise<SmtpConnection>((resolve, reject) => {
      const connected = options.secure
        ? connectTls({ host: options.host, port: options.port, servername: options.host }, () => resolve(connected))
        : connectTcp({ host: options.host, port: options.port }, () => resolve(connected));
      connected.once('error', reject);
      connected.setTimeout(20_000, () => connected.destroy(new Error('SMTP 连接超时。')));
    });
    const client = new SmtpClient(socket);
    await client.expect(220);
    await client.command(`EHLO memorae.cn`, 250);
    if (!options.secure) {
      await client.command('STARTTLS', 220);
      const tls = await new Promise<TLSSocket>((resolve, reject) => {
        const upgraded = connectTls({ socket, servername: options.host }, () => resolve(upgraded));
        upgraded.once('error', reject);
      });
      client.socket.off('data', client.onSocketData);
      return SmtpClient.connectTlsClient(tls, options);
    }
    await client.authenticate(options.username, options.password);
    return client;
  }

  private static async connectTlsClient(socket: TLSSocket, options: SmtpEmailSenderOptions): Promise<SmtpClient> {
    const client = new SmtpClient(socket);
    await client.command('EHLO memorae.cn', 250);
    await client.authenticate(options.username, options.password);
    return client;
  }

  async authenticate(username: string, password: string): Promise<void> {
    try {
      await this.command(`AUTH PLAIN ${Buffer.from(`\0${username}\0${password}`).toString('base64')}`, 235);
    } catch {
      await this.command('AUTH LOGIN', 334);
      await this.command(Buffer.from(username).toString('base64'), 334);
      await this.command(Buffer.from(password).toString('base64'), 235);
    }
  }

  async send(from: string, to: string, subject: string, body: string): Promise<void> {
    await this.command(`MAIL FROM:<${mailbox(from)}>`, 250);
    await this.command(`RCPT TO:<${mailbox(to)}>`, 250);
    await this.command('DATA', 354);
    await this.command([
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      body.replace(/\r?\n/g, '\r\n').replace(/(^|\r\n)\./g, '$1..'),
      '.',
    ].join('\r\n'), 250);
  }

  async close(): Promise<void> {
    try { await this.command('QUIT', 221); } finally { this.socket.destroy(); }
  }

  private command(value: string, expected: number): Promise<string> {
    this.socket.write(`${value}\r\n`);
    return this.expect(expected);
  }

  private expect(expected: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.onData('');
    }).then((response) => {
      const status = Number(response.slice(0, 3));
      if (status !== expected) throw new Error(`SMTP 返回异常：${status}。`);
      return response;
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    while (this.pending.length) {
      const end = this.buffer.indexOf('\r\n');
      if (end < 0) return;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      if (!/^\d{3}( |$)/.test(line)) continue;
      if (line[3] === '-') continue;
      const waiter = this.pending.shift()!;
      waiter.resolve(line);
    }
  }

  private rejectPending(error: Error): void {
    for (const waiter of this.pending.splice(0)) waiter.reject(error);
  }
}

function mailbox(value: string): string {
  const match = value.match(/<([^<>\s]+)>/);
  return (match?.[1] ?? value).trim();
}

export class SmtpEmailSender implements EmailSender {
  constructor(private readonly options: SmtpEmailSenderOptions) {}

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const client = await SmtpClient.connect(this.options);
    try {
      await client.send(
        this.options.from,
        email,
        '所忆 Memorae 注册验证码',
        `你的验证码是：${code}\n\n验证码 10 分钟内有效。如果不是你本人操作，请忽略此邮件。`,
      );
    } finally {
      await client.close();
    }
  }
}

export interface EmailRegistrationStore {
  createEmailVerification(record: EmailVerificationRecord): Promise<void>;
  findLatestEmailVerification(email: string): Promise<EmailVerificationRecord | null>;
  countEmailVerificationsSince(email: string, since: string): Promise<number>;
  incrementEmailVerificationAttempts(id: string): Promise<void>;
  consumeEmailVerification(id: string, consumedAt: string): Promise<boolean>;
}

export interface EmailRegistrationOptions {
  sender: EmailSender;
  codeSecret: string;
  now?: () => Date;
  codeTtlMs?: number;
  requestIntervalMs?: number;
  maxAttempts?: number;
}

export class EmailRegistrationError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'EmailRegistrationError';
  }
}

export class EmailRegistrationService {
  private readonly now: () => Date;
  private readonly codeTtlMs: number;
  private readonly requestIntervalMs: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly store: EmailRegistrationStore,
    private readonly authenticator: {
      loginEmail(email: string, deviceId?: string): Promise<LoginSession>;
    },
    private readonly options: EmailRegistrationOptions,
  ) {
    if (options.codeSecret.length < 32) throw new Error('邮箱验证码密钥至少需要 32 个字符。');
    this.now = options.now ?? (() => new Date());
    this.codeTtlMs = options.codeTtlMs ?? 10 * 60 * 1000;
    this.requestIntervalMs = options.requestIntervalMs ?? 60 * 1000;
    this.maxAttempts = options.maxAttempts ?? 5;
  }

  normalizeEmail(value: string): string {
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 190) {
      throw new EmailRegistrationError(400, '请输入有效的邮箱地址。');
    }
    return email;
  }

  async requestCode(value: string): Promise<void> {
    const email = this.normalizeEmail(value);
    const now = this.now();
    const recent = await this.store.countEmailVerificationsSince(
      email,
      new Date(now.getTime() - this.requestIntervalMs).toISOString(),
    );
    if (recent > 0) throw new EmailRegistrationError(429, '验证码已发送，请稍后再试。');
    const code = String(randomInt(100000, 1000000));
    await this.options.sender.sendVerificationCode(email, code);
    await this.store.createEmailVerification({
      id: randomUUID(),
      email,
      codeHash: hashCode(this.options.codeSecret, email, code),
      expiresAt: new Date(now.getTime() + this.codeTtlMs).toISOString(),
      attempts: 0,
      consumedAt: null,
      createdAt: now.toISOString(),
    });
  }

  async verifyCode(value: string, code: string, deviceId?: string): Promise<LoginSession> {
    const email = this.normalizeEmail(value);
    if (!/^\d{6}$/.test(code.trim())) throw new EmailRegistrationError(401, '验证码不正确或已过期。');
    const record = await this.store.findLatestEmailVerification(email);
    const now = this.now();
    if (!record || record.consumedAt || new Date(record.expiresAt) <= now || record.attempts >= this.maxAttempts) {
      throw new EmailRegistrationError(401, '验证码不正确或已过期。');
    }
    if (!sameHash(record.codeHash, hashCode(this.options.codeSecret, email, code.trim()))) {
      await this.store.incrementEmailVerificationAttempts(record.id);
      throw new EmailRegistrationError(401, '验证码不正确或已过期。');
    }
    if (!await this.store.consumeEmailVerification(record.id, now.toISOString())) {
      throw new EmailRegistrationError(401, '验证码不正确或已过期。');
    }
    return this.authenticator.loginEmail(email, deviceId);
  }
}

function hashCode(secret: string, email: string, code: string): string {
  return createHmac('sha256', secret).update(`${email}:${code}`, 'utf8').digest('hex');
}

function sameHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
