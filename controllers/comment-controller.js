const assert = require('assert')
const { User, Restaurant, Comment } = require('../models')
const { getUser } = require('../helpers/auth-helpers')
const commentController = {
  postComment: (req, res, next) => {
    const { restaurantId, text } = req.body
    const userId = getUser(req).id
    assert(text, 'Comment text is required!')
    return Promise.all([
      User.findByPk(userId),
      Restaurant.findByPk(restaurantId)
    ])
      .then(([user, restaurant]) => {
        assert(user, "User didn't exist!")
        assert(restaurant, "Restaurant didn't exist!")
        return Comment.create({ text, restaurantId, userId })
      })
      .then(() => res.redirect(`/restaurants/${restaurantId}`))
      .catch(err => next(err))
  },
  deleteComment: (req, res, next) => {
    return Comment.findByPk(req.params.id)
      .then(comment => {
        assert(comment, "Comment didn't exist!")
        return comment.destroy()
      })
      .then(deletedComment => {
        req.flash('success_messages', 'Comment deleted successfully.')
        res.redirect(`/restaurants/${deletedComment.restaurantId}`)
      })
      .catch(err => next(err))
  }
}

module.exports = commentController
