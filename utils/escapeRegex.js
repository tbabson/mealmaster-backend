// Escape user input before it is used inside a MongoDB $regex / RegExp, so a
// search box cannot inject a pattern (or a catastrophically slow one).
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive "contains" filter for a user-supplied search term.
export const containsFilter = (value) => ({ $regex: escapeRegex(value), $options: 'i' });
