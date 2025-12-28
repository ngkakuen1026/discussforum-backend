import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { createDraft, deleteMultiplePostDrafts, updateDraft, viewOwnPostDrafts, viewSinglePostDraft } from '../controllers/postDraftControllers';

const router = express.Router();

router.get("/post-drafts/me", isAuthenticated, viewOwnPostDrafts);
router.get("/post-draft/:draftId", isAuthenticated, viewSinglePostDraft);
router.post("/post-draft", isAuthenticated, createDraft);
router.patch("/post-draft/:draftId", isAuthenticated, updateDraft);
router.delete("/post-drafts/me", isAuthenticated, deleteMultiplePostDrafts);

export default router;