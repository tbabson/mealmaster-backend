import Blog from '../models/BlogModel.js';
import { StatusCodes } from 'http-status-codes';
import cloudinary from 'cloudinary';
import fs from 'fs/promises';
import path from 'path';

// Create Blog Post
export const createBlog = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(StatusCodes.BAD_REQUEST)
                .json({ message: 'Please upload a featured image' });
        }

        // Upload image to Cloudinary
        const result = await cloudinary.v2.uploader.upload(req.file.path, {
            folder: 'mealmaster/blogs',
            use_filename: true,
        });

        // Remove local file after upload
        const absolutePath = path.resolve(req.file.path);
        await fs.unlink(absolutePath);

        const blog = await Blog.create({
            ...req.body,
            author: req.user.userId,
            featuredImage: result.secure_url,
            cloudinaryId: result.public_id,
        });

        const populatedBlog = await Blog.findById(blog._id)
            .populate('author', 'fullName')
            .populate('comments.user', 'fullName');

        res.status(StatusCodes.CREATED).json({ blog: populatedBlog });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// Get All Blogs with filtering, sorting, and pagination
export const getAllBlogs = async (req, res) => {
    const { category, search, sort, status } = req.query;
    const queryObject = {};

    // Filtering
    if (category && category !== 'all') {
        queryObject.category = { $regex: new RegExp(`^${category}$`, 'i') };
    }

    if (status && status !== 'all') {
        queryObject.status = status;
    }

    if (search) {
        queryObject.$or = [
            { title: { $regex: search, $options: 'i' } },
            { content: { $regex: search, $options: 'i' } },
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

    // Pagination
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
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
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// Get Single Blog with Related Articles
export const getBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findOne({
            $or: [
                { _id: id },
                { slug: id }
            ],
            status: 'published'
        })
            .populate('author', 'fullName')
            .populate('comments.user', 'fullName');

        if (!blog) {
            return res.status(StatusCodes.NOT_FOUND)
                .json({ message: 'Blog not found' });
        }

        // Get related articles 
        const relatedArticles = await Blog.findRelated(blog._id, 3);

        res.status(StatusCodes.OK).json({
            blog,
            relatedArticles
        });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// // Get Single Blog with Related Articles
// export const getSingleBlog = async (req, res) => {
//     const { id } = req.params;
//     const blog = await Blog.findById(id).populate('author', 'fullName');

//     if (!blog) {
//         return res.status(StatusCodes.NOT_FOUND).json({ msg: 'Blog not found' });
//     }

//     // Get related articles
//     const relatedArticles = await Blog.findRelated(id, 3);

//     res.status(StatusCodes.OK).json({
//         blog,
//         relatedArticles
//     });
// };

// Update Blog
export const updateBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(StatusCodes.NOT_FOUND)
                .json({ message: 'Blog not found' });
        }

        // Check if user is the author
        if (blog.author.toString() !== req.user.userId) {
            return res.status(StatusCodes.UNAUTHORIZED)
                .json({ message: 'Not authorized to update this blog' });
        }

        if (req.file) {
            // Delete old image from Cloudinary
            await cloudinary.v2.uploader.destroy(blog.cloudinaryId);

            // Upload new image
            const result = await cloudinary.v2.uploader.upload(req.file.path, {
                folder: 'mealmaster/blogs',
                use_filename: true,
            });

            // Remove local file
            const absolutePath = path.resolve(req.file.path);
            await fs.unlink(absolutePath);

            req.body.featuredImage = result.secure_url;
            req.body.cloudinaryId = result.public_id;
        }

        const updatedBlog = await Blog.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        ).populate('author', 'fullName')
            .populate('comments.user', 'fullName');

        res.status(StatusCodes.OK).json({ blog: updatedBlog });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// Delete Blog
export const deleteBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(StatusCodes.NOT_FOUND)
                .json({ message: 'Blog not found' });
        }

        // Check if user is the author
        if (blog.author.toString() !== req.user.userId) {
            return res.status(StatusCodes.UNAUTHORIZED)
                .json({ message: 'Not authorized to delete this blog' });
        }

        // Delete image from Cloudinary
        if (blog.cloudinaryId) {
            await cloudinary.v2.uploader.destroy(blog.cloudinaryId);
        }

        await blog.deleteOne();

        res.status(StatusCodes.OK)
            .json({ message: 'Blog deleted successfully' });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// Add Comment
export const addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;

        // Validate content
        if (!content || !content.trim()) {
            return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Comment content is required' });
        }

        // Add comment and return updated blog with populated fields
        const blog = await Blog.findByIdAndUpdate(
            id,
            {
                $push: {
                    comments: {
                        content,
                        user: req.user.userId,
                    },
                },
            },
            { new: true }
        )
            .populate('author', 'fullName')
            .populate('comments.user', 'fullName');

        if (!blog) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Blog not found' });
        }

        res.status(StatusCodes.OK).json({ blog });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// Delete Comment
export const deleteComment = async (req, res) => {
    try {
        const { id: blogId, commentId } = req.params;
        const blog = await Blog.findById(blogId);

        if (!blog) {
            return res.status(StatusCodes.NOT_FOUND)
                .json({ message: 'Blog not found' });
        }

        const comment = blog.comments.id(commentId);

        if (!comment) {
            return res.status(StatusCodes.NOT_FOUND)
                .json({ message: 'Comment not found' });
        }

        // Check if user is the comment author or blog author
        if (comment.user.toString() !== req.user.userId &&
            blog.author.toString() !== req.user.userId) {
            return res.status(StatusCodes.UNAUTHORIZED)
                .json({ message: 'Not authorized to delete this comment' });
        }

        comment.deleteOne();
        await blog.save();

        const updatedBlog = await Blog.findById(blogId)
            .populate('author', 'fullName')
            .populate('comments.user', 'fullName');

        res.status(StatusCodes.OK).json({ blog: updatedBlog });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};