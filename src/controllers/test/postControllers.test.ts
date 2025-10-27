jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));
jest.mock('../../utils/notificationUtils', () => ({ __esModule: true, createNotification: jest.fn() }));
jest.mock('../../utils/extractUserMentions', () => ({ __esModule: true, extractUserMentions: jest.fn() }));
jest.mock('../../utils/dateUtils', () => ({ __esModule: true, formatDate: jest.fn(() => '2025-10-27') }));

// mock attachUserIfExists, sets req.user only when test header 'x-test-user' === 'test-user'
jest.mock('../../middleware/attachUserIfExists', () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    const marker = req.headers['x-test-user'] || req.headers['authorization'];
    if (marker === 'test-user') req.user = { id: 1 };
    return next();
  }
}));

// mock isAuthenticated middleware, allows when header 'x-test-user' === 'test-user'
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
import { extractUserMentions } from '../../utils/extractUserMentions';
import { formatDate } from '../../utils/dateUtils';

const pool = poolDefault as unknown as { query: jest.Mock };

describe('Post routes - integration tests (supertest) with mocked DB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/v1/posts/all-posts (Get all post) -> 200 and returns posts (public)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Hello' }] });

    const res = await request(app).get('/api/v1/posts/all-posts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ posts: expect.any(Array) }));
    expect(res.body.posts[0]).toMatchObject({ id: 1, title: 'Hello' });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('GET /api/v1/posts/post/:postId (Get specific post by post id) -> 404 when not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/v1/posts/post/99');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Post not found' });
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM posts WHERE id = $1', [99]);
  });

  it('GET /api/v1/posts/post/:postId (Get specific post by post id) -> 200 when found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 5, title: 'Found' }] });

    const res = await request(app).get('/api/v1/posts/post/5');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ post: expect.objectContaining({ id: 5, title: 'Found' }) }));
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM posts WHERE id = $1', [5]);
  });

  it('GET /api/v1/posts/search?query=Match (Search post) -> 400 when missing query', async () => {
    const res = await request(app).get('/api/v1/posts/search');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Search query is required' });
  });

  it('GET /api/v1/posts/search?query=Match (Search post) -> 200 and returns results', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 7, title: 'Match' }] });

    const res = await request(app).get('/api/v1/posts/search').query({ query: 'Match' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ posts: expect.arrayContaining([expect.objectContaining({ id: 7, title: 'Match' })]) }));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM posts WHERE posts.title ILIKE'), [`%Match%`]);
  });

  it('GET /api/v1/posts/all-posts/category/:categoryId (Get all post of specific category by category id ) -> 200 returns category posts', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 9, category_id: 2, title: 'CatPost' }] });

    const res = await request(app).get('/api/v1/posts/all-posts/category/2');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ posts: expect.arrayContaining([expect.objectContaining({ category_id: 2 })]) }));
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM posts WHERE category_id = $1', [2]);
  });

  it('GET /api/v1/posts/all-posts (Get all post) -> authenticated: excludes blocked users (two DB calls)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ blocked_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3, user_id: 1, title: 'Allowed post' }] });

    const res = await request(app)
      .get('/api/v1/posts/all-posts')
      .set('x-test-user', 'test-user');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ posts: expect.arrayContaining([expect.objectContaining({ id: 3 })]) }));
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('GET /api/v1/posts/all-posts/me (Get own post) -> authenticated user posts', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 11, user_id: 3, title: 'Own' }] });

    const res = await request(app)
      .get('/api/v1/posts/all-posts/me')
      .set('x-test-user', 'test-user');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ posts: expect.arrayContaining([expect.objectContaining({ user_id: 3 })]) }));
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC', [3]);
  });

  it('POST /api/v1/posts/post (Create post) -> 201 creates post (no tag) and notifies followers', async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 10, created_at: new Date(), title: 'T' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ username: 'alice' }] });

    (extractUserMentions as jest.Mock).mockReturnValue([]);
    (notificationUtils.createNotification as jest.Mock).mockResolvedValue(undefined);
    (formatDate as jest.Mock).mockReturnValue('2025-10-27');

    const payload = { title: 'T', content: 'content', categoryId: 2 };
    const res = await request(app)
      .post('/api/v1/posts/post')
      .set('x-test-user', 'test-user')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      message: 'Post created successfully',
      post: expect.objectContaining({ id: 10, title: 'T' })
    }));

    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM categories WHERE id = $1', [2]);
    expect(pool.query).toHaveBeenNthCalledWith(2,
      'INSERT INTO posts (user_id, title, content, category_id, created_at, pending_tag_name) VALUES ($1, $2, $3, $4, NOW(), $5) RETURNING *',
      [3, 'T', 'content', 2, null]
    );
    expect(notificationUtils.createNotification).not.toHaveBeenCalled();
  });

  it('POST /api/v1/posts/post (Create Post) -> 400 when required fields missing', async () => {
    const payload = { title: '', content: '', categoryId: null };
    const res = await request(app)
      .post('/api/v1/posts/post')
      .set('x-test-user', 'test-user')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Title, content and categoryId are required.' });
  });

  it('POST /api/v1/posts/post (Create Post) -> 404 when category not found', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0 });

    const payload = { title: 'T', content: 'C', categoryId: 999 };
    const res = await request(app)
      .post('/api/v1/posts/post')
      .set('x-test-user', 'test-user')
      .send(payload);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Category not found' });
  });

  it('DELETE /api/v1/posts/post/:postId (Delete Post) -> 200 deletes own post', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 3 }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app)
      .delete('/api/v1/posts/post/5')
      .set('x-test-user', 'test-user');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Post deleted successfully' });
    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM posts WHERE id = $1 AND user_id = $2', [5, 3]);
    expect(pool.query).toHaveBeenNthCalledWith(2, 'DELETE FROM posts WHERE id = $1', [5]);
  });

  it('DELETE /api/v1/posts/post/:postId (Delete Post) -> 404 when post not found or not owned', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete('/api/v1/posts/post/999')
      .set('x-test-user', 'test-user');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Post not found' });
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM posts WHERE id = $1 AND user_id = $2', [999, 3]);
  });
});