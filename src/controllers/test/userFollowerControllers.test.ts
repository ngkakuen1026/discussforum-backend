jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));
jest.mock('../../utils/notificationUtils', () => ({ __esModule: true, createNotification: jest.fn() }));

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
import { createNotification } from '../../utils/notificationUtils';

const pool = poolDefault as unknown as { query: jest.Mock };
const createNotif = createNotification as unknown as jest.Mock;

describe('UserFollower controllers - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('GET /api/v1/user-following/followers/me', () => {
        it('returns 200 with followers list', async () => {
            pool.query.mockResolvedValueOnce({
                rows: [
                    { id: 4, username: 'alice' },
                    { id: 5, username: 'bob' }
                ]
            });

            const res = await request(app).get('/api/v1/user-following/followers/me').set('x-test-user', 'test-user');

            expect(res.status).toBe(200);
            expect(res.body.followersCount).toEqual(2);
            expect(res.body.followers).toEqual([{ id: 4, username: 'alice' }, { id: 5, username: 'bob' }]);
            expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN user_following'), [3]);
        });

        it('returns 401 when not authenticated', async () => {
            const res = await request(app).get('/api/v1/user-following/followers/me');

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: 'Unauthorized' });
            expect(pool.query).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/v1/user-following/following/me', () => {
        it('returns 200 with following list', async () => {
            const dbRows = [{ id: 7, username: 'carol' }];
            pool.query.mockResolvedValueOnce({ rows: dbRows });

            const res = await request(app).get('/api/v1/user-following/following/me').set('x-test-user', 'test-user');

            expect(res.status).toBe(200);
            expect(res.body.followingCount).toBe(1);
            expect(res.body.following).toEqual(dbRows);
            expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN user_following'), [3]);
        });
    });

    describe('POST /api/v1/user-following/follow', () => {
        it('returns 400 when trying to follow yourself', async () => {
            const res = await request(app)
                .post('/api/v1/user-following/follow')
                .set('x-test-user', 'test-user')
                .send({ followedId: 3 });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: 'You cannot follow yourself' });
            expect(pool.query).not.toHaveBeenCalled();
        });

        it('returns 400 when already following', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ follower_id: 3, followed_id: 4 }] });

            const res = await request(app)
                .post('/api/v1/user-following/follow')
                .set('x-test-user', 'test-user')
                .send({ followedId: 4 });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: 'You had already following this user' });
            expect(pool.query).toHaveBeenCalledWith(
                'SELECT * FROM user_following WHERE follower_id = $1 AND followed_id = $2',
                [3, 4]
            );
        });

        it('returns 201 on successful follow and creates notification', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [] }) // existingFollow check
                .mockResolvedValueOnce({}) // insert into user_following
                .mockResolvedValueOnce({ rows: [{ username: 'followerName' }] }); // select follower username

            createNotif.mockResolvedValueOnce(undefined);

            const res = await request(app)
                .post('/api/v1/user-following/follow')
                .set('x-test-user', 'test-user')
                .send({ followedId: 8 });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({ message: 'User followed successfully' });

            expect(pool.query).toHaveBeenNthCalledWith(1,
                'SELECT * FROM user_following WHERE follower_id = $1 AND followed_id = $2',
                [3, 8]
            );
            expect(pool.query).toHaveBeenNthCalledWith(2,
                'INSERT INTO user_following (follower_id, followed_id) VALUES ($1, $2)',
                [3, 8]
            );
            expect(pool.query).toHaveBeenNthCalledWith(3,
                'SELECT username FROM users WHERE id = $1',
                [3]
            );

            expect(createNotif).toHaveBeenCalledWith(8, expect.stringContaining('started following you'), 'follow', 3);
        });
    });

    describe('DELETE /api/v1/user-following/unfollow', () => {
        it('returns 404 when target user does not exist', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] }); // SELECT * FROM users WHERE id = $1

            const res = await request(app)
                .delete('/api/v1/user-following/unfollow')
                .set('x-test-user', 'test-user')
                .send({ followedId: 9 });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: 'User not found' });
            expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [9]);
        });

        it('returns 400 when not following the user', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ id: 9 }] }) // existingUser check
                .mockResolvedValueOnce({ rows: [] }); // existingFollow check

            const res = await request(app)
                .delete('/api/v1/user-following/unfollow')
                .set('x-test-user', 'test-user')
                .send({ followedId: 9 });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: 'You are not following this user' });
        });

        it('returns 200 on successful unfollow and creates notification', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ id: 9 }] }) // existingUser
                .mockResolvedValueOnce({ rows: [{ follower_id: 3, followed_id: 9 }] }) // existingFollow
                .mockResolvedValueOnce({}) // delete
                .mockResolvedValueOnce({ rows: [{ username: 'followerName' }] }); // select follower username

            createNotif.mockResolvedValueOnce(undefined);

            const res = await request(app)
                .delete('/api/v1/user-following/unfollow')
                .set('x-test-user', 'test-user')
                .send({ followedId: 9 });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: 'User unfollowed successfully' });

            expect(pool.query).toHaveBeenNthCalledWith(3,
                'DELETE FROM user_following WHERE follower_id = $1 AND followed_id = $2',
                [3, 9]
            );
            expect(createNotif).toHaveBeenCalledWith(9, expect.stringContaining('unfollowed you'), 'unfollow', 3);
        });
    });
});