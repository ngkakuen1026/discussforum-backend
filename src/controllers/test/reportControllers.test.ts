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

describe("Report routes - integration tests (supertest) with mocked DB", () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('POST /api/v1/reports/report-content/:contentId -> 201 reports content successfully (authenticated)', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 20, content_id: 20, reason: 'Inappropriate content', custom_reason: null }]
        });

        const res = await request(app)
            .post('/api/v1/reports/report-content/20')
            .set('x-test-user', 'test-user')
            .send({ contentType: 'post', reason: 'Inappropriate content' });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({
            message: "Report submitted successfully.",
            report: expect.objectContaining({ id: 20, content_id: 20 })
        });

        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO reports'),
            [3, 20, 'post', 'Inappropriate content', null, undefined]
        );
    });

    it('POST /api/v1/reports/report-content/:contentId -> 400 when contentType missing', async () => {
        const res = await request(app)
            .post('/api/v1/reports/report-content/20')
            .set('x-test-user', 'test-user')
            .send({ reason: 'Inappropriate content' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: "Content Type is required." });
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('POST /api/v1/reports/report-content/:contentId -> 400 when reason missing', async () => {
        const res = await request(app)
            .post('/api/v1/reports/report-content/20')
            .set('x-test-user', 'test-user')
            .send({ contentType: 'post' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: "Reporting reason is required." });
        expect(pool.query).not.toHaveBeenCalled();
    });

    it("POST /api/v1/reports/report-content/:contentId -> 400 when reason === 'other' and customReason missing", async () => {
        const res = await request(app)
            .post('/api/v1/reports/report-content/20')
            .set('x-test-user', 'test-user')
            .send({ contentType: 'post', reason: 'other' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: "Custom reason is required when 'Other' is selected." });
        expect(pool.query).not.toHaveBeenCalled();
    });

    it("POST /api/v1/reports/report-content/:contentId -> 201 when reason === 'other' and customReason provided", async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 21, content_id: 21, reason: 'other', custom_reason: 'Spam link' }]
        });

        const res = await request(app)
            .post('/api/v1/reports/report-content/21')
            .set('x-test-user', 'test-user')
            .send({ contentType: 'comment', reason: 'other', customReason: 'Spam link', additionalComments: 'Seen multiple times' });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({
            message: "Report submitted successfully.",
            report: expect.objectContaining({ id: 21, content_id: 21 })
        });

        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO reports'),
            [3, 21, 'comment', 'other', 'Spam link', 'Seen multiple times']
        );
    });

    it('POST /api/v1/reports/report-content/:contentId -> 401 when not authenticated', async () => {
        const res = await request(app)
            .post('/api/v1/reports/report-content/30')
            .send({ contentType: 'post', reason: 'Inappropriate content' });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Unauthorized' });
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('POST /api/v1/reports/report-content/:contentId -> 500 on DB error', async () => {
        pool.query.mockImplementationOnce(() => { throw new Error('db failure'); });

        const res = await request(app)
            .post('/api/v1/reports/report-content/99')
            .set('x-test-user', 'test-user')
            .send({ contentType: 'post', reason: 'Inappropriate content' });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ message: "Internal server error" });
    });
});