jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

jest.mock('../../middleware/auth', () => ({
    __esModule: true,
    isAuthenticated: (req: any, res: any, next: any) => {
        const marker = req.headers['x-test-user'] || req.headers['authorization'];
        if (marker === 'test-user') {
            req.user = { id: 3 };
            return next();
        }
        return res.status(401).json({ message: 'Unauthorized' });
    }
}));

import request from 'supertest';
import app from '../../app';
import poolDefault from '../../db/db';

const pool = poolDefault as unknown as { query: jest.Mock };

describe('User Blocked routes - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('POST /api/v1/user-blocked/block/:userId', () => {
        it('returns 400 when trying to block yourself', async () => {
            const res = await request(app)
                .post('/api/v1/user-blocked/block/3')
                .set('x-test-user', 'test-user')
                .send({ block_reason: 'spam' });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: 'You cannot block yourself' });
            expect(pool.query).not.toHaveBeenCalled();
        });

        it('returns 400 when user is already blocked', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ blocker_id: 3, blocked_id: 4 }] });

            const res = await request(app)
                .post('/api/v1/user-blocked/block/4')
                .set('x-test-user', 'test-user')
                .send({ block_reason: 'spam' });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: 'User is already blocked.' });
            expect(pool.query).toHaveBeenCalledWith(
                "SELECT * FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2",
                [3, 4]
            );
        });

        it('returns 200 when blocking succeeds', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] }) // existingBlock check
                .mockResolvedValueOnce({}); // insert

            const res = await request(app)
                .post('/api/v1/user-blocked/block/4')
                .set('x-test-user', 'test-user')
                .send({ block_reason: 'spam' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: 'User blocked successfully.' });
            expect(pool.query).toHaveBeenNthCalledWith(
                1,
                "SELECT * FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2",
                [3, 4]
            );
            expect(pool.query).toHaveBeenNthCalledWith(
                2,
                "INSERT INTO user_blocked (blocker_id, blocked_id, block_reason) VALUES ($1, $2, $3)",
                [3, 4, 'spam']
            );
        });

        it('returns 500 on DB error while blocking', async () => {
            pool.query.mockImplementationOnce(() => { throw new Error('db failure'); });

            const res = await request(app)
                .post('/api/v1/user-blocked/block/4')
                .set('x-test-user', 'test-user')
                .send({ block_reason: 'spam' });

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: 'Internal server error' });
        });
    });

    describe('DELETE /api/v1/user-blocked/unblock/:userId', () => {
        it('returns 404 when unblock target not found', async () => {
            pool.query.mockResolvedValueOnce({ rowCount: 0 });

            const res = await request(app)
                .delete('/api/v1/user-blocked/unblock/4')
                .set('x-test-user', 'test-user');

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: 'User not found in blocked list.' });
            expect(pool.query).toHaveBeenCalledWith(
                "DELETE FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2",
                [3, 4]
            );
        });

        it('returns 200 when unblocking succeeds', async () => {
            pool.query.mockResolvedValueOnce({ rowCount: 1 });

            const res = await request(app)
                .delete('/api/v1/user-blocked/unblock/4')
                .set('x-test-user', 'test-user');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: 'User unblocked successfully.' });
        });

        it('returns 500 on DB error while unblocking', async () => {
            pool.query.mockImplementationOnce(() => { throw new Error('db failure'); });

            const res = await request(app)
                .delete('/api/v1/user-blocked/unblock/4')
                .set('x-test-user', 'test-user');

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: 'Internal server error' });
        });
    });

    describe('GET /api/v1/user-blocked/blocked/me', () => {
        it('returns 200 and mapped blocked user list', async () => {
            const dbRows = [
                {
                    id: 4,
                    username: 'alice',
                    profile_image: 'https://img',
                    created_at: '2025-01-01T00:00:00.000Z',
                    block_reason: 'spamming'
                },
                {
                    id: 5,
                    username: 'bob',
                    profile_image: null,
                    created_at: '2025-02-01T00:00:00.000Z',
                    block_reason: null
                }
            ];
            pool.query.mockResolvedValueOnce({ rows: dbRows });

            const res = await request(app)
                .get('/api/v1/user-blocked/blocked/me')
                .set('x-test-user', 'test-user');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(
                expect.objectContaining({
                    message: 'User blocked list fetched successfully',
                    blockedUserList: expect.any(Array)
                })
            );

            expect(res.body.blockedUserList).toEqual([
                {
                    id: 4,
                    username: 'alice',
                    profileImage: 'https://img',
                    blockedAt: '2025-01-01T00:00:00.000Z',
                    blockReason: 'spamming'
                },
                {
                    id: 5,
                    username: 'bob',
                    profileImage: null,
                    blockedAt: '2025-02-01T00:00:00.000Z',
                    blockReason: 'No reason provided'
                }
            ]);

            expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM user_blocked'), [3]);
        });

        it('returns 500 on DB error while fetching blocked users', async () => {
            pool.query.mockImplementationOnce(() => { throw new Error('db failure'); });

            const res = await request(app)
                .get('/api/v1/user-blocked/blocked/me')
                .set('x-test-user', 'test-user');

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: 'Internal server error' });
        });
    });
});