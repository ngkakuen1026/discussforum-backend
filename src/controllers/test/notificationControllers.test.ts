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
import { create } from 'domain';

const pool = poolDefault as unknown as { query: jest.Mock };

describe('Notification routes - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });
    
    it('GET /api/v1/notifications/all-notifications/me (View own notifications) -> 200 and list of notifications', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                {
                    id: 1,
                    user_id: 5,
                    message: 'Notification 1',
                    type: 'mention',
                    related_id: 10,
                    read: false,
                    created_at: new Date().toISOString(),
                    meta_data: null
                }
            ]
        });

        const res = await request(app)
            .get('/api/v1/notifications/all-notifications/me')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ notifications: expect.any(Array) }));
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("FROM notifications WHERE user_id ="), [3]);
    });

    it('GET /api/v1/notifications/all-notifications/me (View own notifications) -> 401 when not authenticated', async () => {
        const res = await request(app).get('/api/v1/notifications/all-notifications/me');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Unauthorized' });
    });

    it('GET /api/v1/notifications/all-notifications/unread-count (Get unread notifications count) -> 200 and count', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ count: '4' }]
        });

        const res = await request(app)
            .get('/api/v1/notifications/all-notifications/unread-count')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ unreadCount: 4 });
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("SELECT COUNT(*) FROM notifications WHERE user_id ="), [3]);
    })

    it('GET /api/v1/notifications/all-notifications/unread-count (Get unread notifications count) -> 401 when not authenticated', async () => {
        const res = await request(app).get('/api/v1/notifications/all-notifications/unread-count');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Unauthorized' });
    });

    it('POST /api/v1/notifications/notifications/read (Mark notifications as read) -> 200 and list of updated notifications', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                {
                    id: 1,
                    user_id: 5,
                    message: 'Notification 1',
                    type: 'mention',
                    related_id: 10,
                    read: false,
                    created_at: new Date().toISOString(),
                    meta_data: null
                },
                {
                    id: 2,
                    user_id: 5,
                    message: 'Notification 2',
                    type: 'reply',
                    related_id: 11,
                    read: false,
                    created_at: new Date().toISOString(),
                    meta_data: null
                }
            ]
        });

        const res = await request(app)
            .post('/api/v1/notifications/notifications/read')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ message: 'Notifications marked as read successfully.', notifications: expect.any(Array) }));
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE notifications SET read = TRUE WHERE user_id ="), [3]);
    });

    it('DELETE /api/v1/notifications/all-notifications/:notificationId (Delete a notification) -> 200 when deleted', async () => {
        pool.query.mockResolvedValueOnce({
            rowCount: 1,
            rows: [{
                id: 1,
                user_id: 3,
                message: 'Notification to delete',
                type: 'mention',
                related_id: 10,
                read: false,
                created_at: new Date().toISOString(),
                meta_data: null
            }],
        });

        const res = await request(app)
            .delete('/api/v1/notifications/all-notifications/1')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ message: 'Notification deleted successfully.', deletedNotification: expect.objectContaining({ id: 1 }) }));
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM notifications WHERE id ="), [1, 3]);
    });

    it('DELETE /api/v1/notifications/all-notifications/:notificationId (Delete a notification) -> 404 when notification not found', async () => {
        pool.query.mockResolvedValueOnce({ rowCount: 0 });

        const res = await request(app)
            .delete('/api/v1/notifications/all-notifications/999')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'Notification not found.' });
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM notifications WHERE id ="), [999, 3]);
    });
});
