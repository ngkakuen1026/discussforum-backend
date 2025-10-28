// Mocks must be declared before importing app so routes/middleware use the mocked modules
jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));
jest.mock('../../utils/notificationUtils', () => ({ __esModule: true, createNotification: jest.fn() }));

// mock isAuthenticated middleware - allows when header 'x-test-user' === 'test-user'
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
import * as notificationUtils from '../../utils/notificationUtils';

const pool = poolDefault as unknown as { query: jest.Mock };

describe('Post vote routes - integration tests (supertest) with mocked DB', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('GET /api/v1/posts/votes/:postId (Get post votes) -> 404 when post not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/v1/posts/votes/5');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Post not found' });
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM posts WHERE id = $1', [5]);
  });

  it('GET /api/v1/posts/votes/:postId (Get post votes) -> 200 returns grouped votes when post exists', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // postResult
      .mockResolvedValueOnce({ rows: [{ vote_type: 1, count: '2' }, { vote_type: -1, count: '1' }] });

    const res = await request(app).get('/api/v1/posts/votes/5');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ votes: [{ vote_type: 1, count: '2' }, { vote_type: -1, count: '1' }] });
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM posts WHERE id = $1', [5]);
    expect(pool.query).toHaveBeenCalledWith('SELECT vote_type, COUNT(*) as count FROM post_votes WHERE post_id = $1 GROUP BY vote_type', [5]);
  });

  it('POST /api/v1/posts/votes/:postId (Vote post (upvote, like)) -> 200 records vote (authenticated) and notifies post owner', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 10, user_id: 99, title: 'Post Title' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ username: 'voter' }] });

    (notificationUtils.createNotification as jest.Mock).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/posts/votes/10')
      .set('x-test-user', 'test-user')
      .send({ voteType: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Vote recorded successfully.' });

    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM posts WHERE id = $1', [10]);
    expect(pool.query).toHaveBeenNthCalledWith(2, 'SELECT * FROM post_votes WHERE post_id = $1 AND user_id = $2', [10, 3]);
    expect(pool.query).toHaveBeenNthCalledWith(3, 'INSERT INTO post_votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)', [10, 3, 1]);
    expect(pool.query).toHaveBeenNthCalledWith(4, 'SELECT username FROM users WHERE id = $1', [3]);

    expect(notificationUtils.createNotification).toHaveBeenCalledWith(99, expect.stringContaining('User voter liked your post: \Post Title\.'), 'like', 10);
  });

  it('POST /api/v1/posts/votes/:postId (Vote post (downvote, dislike)) -> 200 records vote (authenticated) and notifies post owner', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 10, user_id: 99, title: 'Post Title' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ username: 'voter' }] });

    (notificationUtils.createNotification as jest.Mock).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/posts/votes/10')
      .set('x-test-user', 'test-user')
      .send({ voteType: -1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Vote recorded successfully.' });

    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM posts WHERE id = $1', [10]);
    expect(pool.query).toHaveBeenNthCalledWith(2, 'SELECT * FROM post_votes WHERE post_id = $1 AND user_id = $2', [10, 3]);
    expect(pool.query).toHaveBeenNthCalledWith(3, 'INSERT INTO post_votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)', [10, 3, -1]);
    expect(pool.query).toHaveBeenNthCalledWith(4, 'SELECT username FROM users WHERE id = $1', [3]);


    expect(notificationUtils.createNotification).toHaveBeenCalledWith(99, expect.stringContaining('User voter disliked your post: \Post Title\.'), 'dislike', 10);
  });

  it('POST /api/v1/posts/votes/:postId (Vote post) -> 403 when user already voted', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 20, user_id: 50, title: 'P' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, vote_type: 1, user_id: 3 }] });

    const res = await request(app)
      .post('/api/v1/posts/votes/20')
      .set('x-test-user', 'test-user')
      .send({ voteType: 1 });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'You have already voted on this post. You cannot change your vote.' });
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM post_votes WHERE post_id = $1 AND user_id = $2', [20, 3]);
  });

  it('POST /api/v1/posts/votes/:postId (Vote post) -> 400 when invalid voteType provided', async () => {
    const res = await request(app)
      .post('/api/v1/posts/votes/10')
      .set('x-test-user', 'test-user')
      .send({ voteType: 'upvote' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid vote type. Use 1 for upvote and -1 for downvote.' });
  });
});