import mongoose from 'mongoose';
import Blog from '../models/BlogModel.js';
import { StatusCodes } from 'http-status-codes';
import cloudinary from 'cloudinary';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../errors/customErrors.js';
import { isAdmin } from '../middleware/authMiddleware.js';
import { escapeRegex, containsFilter } from '../utils/escapeRegex.js';
import { getPagination } from '../utils/pagination.js';
import { removeTempFile } from '../utils/files.js';

const MAX_COMMENT_LENGTH = 2000;

// Fields an editor may set. author, comments and image ids are server-controlled.
const EDITABLE_FIELDS = [
    'title', 'metaTitle', 'metaDescription', 'slug', 'keywords', 'content',
    'featuredImageAlt', 'category', 'tags', 'status',
];

const pickEditable = (body) =>
    Object.fromEntries(EDITABLE_FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

const populateBlog = (query) =>
    query.populate('author', 'fullName').populate('comments.user', 'fullName');

// Create Blog Post (admin)
export const createBlog = async (req, res) => {
    try {
        if (!req.file) {
            throw new BadRequestError('Please upload a featured image');
        }

        const result = await cloudinary.v2.uploader.upload(req.file.path, {
            folder: 'mealmaster/blogs',
            use_filename: true,
        });

        const blog = await Blog.create({
            ...pickEditable(req.body),
            author: req.user.userId,
            featuredImage: result.secure_url,
            cloudinaryId: result.public_id,
        });

        const populatedBlog = await populateBlog(Blog.findById(blog._id));
        res.status(StatusCodes.CREATED).json({ blog: populatedBlog });
    } finally {
        await removeTempFile(req.file);
    }
};

// Get All Blogs with filtering, sorting, and pagination
export const getAllBlogs = async (req, res) => {
    const { category, search, sort, status } = req.query;
    const queryObject = {};

    // Filtering
    if (category && category !== 'all') {
        queryObject.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' };
    }

    // Drafts are only visible to admins
    if (!isAdmin(req.user)) {
        queryObject.status = 'published';
    } else if (status && status !== 'all') {
        queryObject.status = String(status);
    }

    if (search) {
        queryObject.$or = [
            { title: containsFilter(search) },
            { content: containsFilter(search) },
        ];
    }

    // Sorting
    const sortOptions = {
        newest: '-createdAt',
        oldest: 'createdAt',
        'a-z': 'title',
        'z-a': '-title',
    };

    const sortKey = sortOptions[sort] || sortOptions.newest;
    const { page, limit, skip } = getPagination(req.query);

    const blogs = await Blog.find(queryObject)
        .populate('author', 'fullName')
        .sort(sortKey)
        .skip(skip)
        .limit(limit);

    const totalBlogs = await Blog.countDocuments(queryObject);
    const numOfPages = Math.ceil(totalBlogs / limit);

    res.status(StatusCodes.OK).json({
        blogs,
        totalBlogs,
        numOfPages,
        currentPage: page,
    });
};

// Get Single Blog (by id or slug) with Related Articles
export const getBlog = async (req, res) => {
    const { id } = req.params;

    // Querying _id with a slug throws a CastError, so pick the right field
    const identifier = mongoose.isValidObjectId(id) ? { _id: id } : { slug: String(id).toLowerCase() };
    const blog = await populateBlog(Blog.findOne({ ...identifier, status: 'published' }));

    if (!blog) {
        throw new NotFoundError('Blog not found');
    }

    const relatedArticles = await Blog.findRelated(blog._id, 3);

    res.status(StatusCodes.OK).json({
        blog,
        relatedArticles
    });
};

// Update Blog (admin)
export const updateBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            throw new NotFoundError('Blog not found');
        }

        Object.assign(blog, pickEditable(req.body));

        let oldCloudinaryId;
        if (req.file) {
            const result = await cloudinary.v2.uploader.upload(req.file.path, {
                folder: 'mealmaster/blogs',
                use_filename: true,
            });
            oldCloudinaryId = blog.cloudinaryId;
            blog.featuredImage = result.secure_url;
            blog.cloudinaryId = result.public_id;
        }

        // save() (not findByIdAndUpdate) so validation and slug generation run
        await blog.save();

        // Only remove the old image once the new one is stored
        if (oldCloudinaryId) {
            await cloudinary.v2.uploader.destroy(oldCloudinaryId);
        }

        const updatedBlog = await populateBlog(Blog.findById(blog._id));
        res.status(StatusCodes.OK).json({ blog: updatedBlog });
    } finally {
        await removeTempFile(req.file);
    }
};

// Delete Blog (admin)
export const deleteBlog = async (req, res) => {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
        throw new NotFoundError('Blog not found');
    }

    if (blog.cloudinaryId) {
        await cloudinary.v2.uploader.destroy(blog.cloudinaryId);
    }

    await blog.deleteOne();

    res.status(StatusCodes.OK).json({ message: 'Blog deleted successfully' });
};

// Add Comment
export const addComment = async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;

    if (typeof content !== 'string' || !content.trim()) {
        throw new BadRequestError('Comment content is required');
    }
    if (content.length > MAX_COMMENT_LENGTH) {
        throw new BadRequestError(`Comments are limited to ${MAX_COMMENT_LENGTH} characters`);
    }

    const blog = await populateBlog(Blog.findOneAndUpdate(
        { _id: id, status: 'published' },
        {
            $push: {
                comments: {
                    content: content.trim(),
                    user: req.user.userId,
                },
            },
        },
        { new: true }
    ));

    if (!blog) {
        throw new NotFoundError('Blog not found');
    }

    res.status(StatusCodes.OK).json({ blog });
};

// Delete Comment — comment author, blog author, or admin
export const deleteComment = async (req, res) => {
    const { id: blogId, commentId } = req.params;
    const blog = await Blog.findById(blogId);

    if (!blog) {
        throw new NotFoundError('Blog not found');
    }

    const comment = blog.comments.id(commentId);
    if (!comment) {
        throw new NotFoundError('Comment not found');
    }

    const userId = req.user.userId;
    if (!isAdmin(req.user) &&
        comment.user.toString() !== userId &&
        blog.author.toString() !== userId) {
        throw new UnauthorizedError('Not authorized to delete this comment');
    }

    comment.deleteOne();
    await blog.save();

    const updatedBlog = await populateBlog(Blog.findById(blogId));
    res.status(StatusCodes.OK).json({ blog: updatedBlog });
};
