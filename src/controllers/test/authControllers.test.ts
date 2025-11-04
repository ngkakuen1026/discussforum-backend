process.env.ACCESS_TOKEN_SECRET = 'access-secret';
process.env.REFRESH_TOKEN_SECRET = 'refresh-secret';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));
jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('bcrypt', () => ({
    hash: jest.fn(async () => 'hashed-password'),
    compare: jest.fn()
}));
jest.mock('jsonwebtoken', () => ({
    sign: jest.fn(() => 'signed-token'),
    verify: jest.fn()
}));

import request from 'supertest';
import app from '../../app';
import poolDefault from '../../db/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const pool = poolDefault as unknown as { query: jest.Mock };
const bCompare = bcrypt.compare as unknown as jest.Mock;
const jwtSign = jwt.sign as unknown as jest.Mock;
const jwtVerify = jwt.verify as unknown as jest.Mock;

describe('Auth controllers - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('POST /api/v1/auth/register (User registration) -> 201 when new user created', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 42, username: 'bob', email: 'b@x.com' }] });

        const payload = {
            username: 'bob',
            email: 'b@x.com',
            password: 'pass',
            first_name: 'Bob',
            last_name: 'B',
            phone: '123',
            gender: 'm',
            bio: '',
            is_admin: false
        };

        const res = await request(app).post('/api/v1/auth/register').send(payload);

        expect(res.status).toBe(201);
        expect(res.body).toEqual(expect.objectContaining({ message: 'User registered successfully', user: expect.objectContaining({ id: 42 }) }));
        expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM users WHERE username = $1', ['bob']);
        expect(pool.query).toHaveBeenNthCalledWith(2, 'SELECT * FROM users WHERE email = $1', ['b@x.com']);
        expect(pool.query).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO users'), expect.any(Array));
    });

    it('POST /api/v1/auth/register (User registration) -> 400 when username exists', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // checkUsername

        const res = await request(app).post('/api/v1/auth/register').send({
            username: 'exists',
            email: 'e@x.com',
            password: 'p',
            first_name: '', last_name: '', phone: '', gender: '', bio: '', is_admin: false
        });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Username already exists' });
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE username = $1', ['exists']);
    });

    it('POST /api/v1/auth/login (User login) -> 404 when user not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); 

        const res = await request(app).post('/api/v1/auth/login').send({ email: 'no@x', password: 'p' });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'User not found' });
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE email = $1', ['no@x']);
    });

    it('POST /api/v1/auth/login (User login) -> 401 when incorrect password', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 5, username: 'u', password_hash: 'hash', email: 'u@x', is_admin: false }] });
        bCompare.mockResolvedValueOnce(false);

        const res = await request(app).post('/api/v1/auth/login').send({ email: 'u@x', password: 'bad' });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Incorrect password' });
        expect(bCompare).toHaveBeenCalledWith('bad', 'hash');
    });

    it('POST /api/v1/auth/login (User login) -> 200 on success, sets cookies and returns accessToken + user', async () => {
        const userRow = { id: 7, username: 'alice', password_hash: 'hash', email: 'a@x', is_admin: false };
        pool.query
            .mockResolvedValueOnce({ rows: [userRow] }) // SELECT user
            .mockResolvedValueOnce({}) // DELETE refresh tokens
            .mockResolvedValueOnce({}); // INSERT refresh token

        bCompare.mockResolvedValueOnce(true);
        jwtSign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

        const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@x', password: 'good' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({
            message: expect.stringContaining('Welcome back'),
            accessToken: expect.any(String),
            user: expect.objectContaining({ username: 'alice', email: 'a@x' })
        }));

        // cookies set in headers
        expect(res.headers['set-cookie']).toBeDefined();
        // DB calls sequence
        expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM users WHERE email = $1', ['a@x']);
        expect(pool.query).toHaveBeenNthCalledWith(2, 'DELETE FROM refresh_tokens WHERE user_id = $1', [7]);
        expect(pool.query).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO refresh_tokens'), expect.any(Array));
    });

    it('POST /api/v1/auth/logout (User logout) -> 400 when no refresh token cookie', async () => {
        const res = await request(app).post('/api/v1/auth/logout').send();

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'No refresh token provided' });
    });

    it('POST /api/v1/auth/logout (User logout) -> 200 when refresh token present', async () => {
        pool.query.mockResolvedValueOnce({}); // DELETE FROM refresh_tokens

        const res = await request(app)
            .post('/api/v1/auth/logout')
            .set('Cookie', ['refreshToken=rtoken'])
            .send();

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'User logged out successfully' });
        expect(pool.query).toHaveBeenCalledWith('DELETE FROM refresh_tokens WHERE token = $1', ['rtoken']);
    });

    it('POST /api/v1/auth/token (Refresh token) -> 401 when no cookie', async () => {
        const res = await request(app).post('/api/v1/auth/token').send();

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'No refresh token provided' });
    });

    it('POST /api/v1/auth/token -> 403 when token not found in DB', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // lookup refresh token

        const res = await request(app).post('/api/v1/auth/token').set('Cookie', ['refreshToken=rtoken']).send();

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ message: 'Invalid refresh token' });
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM refresh_tokens WHERE token = $1', ['rtoken']);
    });

    it('POST /api/v1/auth/token (Refresh token) -> 200 when token valid and not expired (sets new access cookie)', async () => {
        // stored token with future expiry
        const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
        pool.query.mockResolvedValueOnce({ rows: [{ token: 'rtoken', user_id: 8, expired_at: future }] });

        // make jwt.verify call invoke callback with decoded user
        jwtVerify.mockImplementationOnce((_token: string, _secret: string, cb: any) => cb(null, { id: 8, username: 'u', email: 'e', is_admin: false }));

        const res = await request(app).post('/api/v1/auth/token').set('Cookie', ['refreshToken=rtoken']).send();

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'Token refreshed' });
        expect(res.headers['set-cookie']).toBeDefined();
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM refresh_tokens WHERE token = $1', ['rtoken']);
    });
});