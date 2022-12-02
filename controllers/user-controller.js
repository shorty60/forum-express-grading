const assert = require('assert')
const bcrypt = require('bcryptjs')
const db = require('../models')
const { imgurFileHandler } = require('../helpers/file-helpers')
const { getUser } = require('../helpers/auth-helpers')
const { User, Comment, Restaurant, Favorite, Like, Followship } = db

const userController = {
  signUpPage: (req, res) => {
    res.render('signup')
  },
  signUp: (req, res, next) => {
    if (req.body.password !== req.body.passwordCheck) {
      throw new Error('Passwords do not match!')
    }
    return User.findOne({ where: { email: req.body.email } })
      .then(user => {
        if (user) throw new Error('Email already exists!')
        return bcrypt.hash(req.body.password, 10)
      })
      .then(hash =>
        User.create({
          name: req.body.name,
          email: req.body.email,
          password: hash
        })
      )
      .then(() => {
        req.flash('success_messages', '成功註冊帳號！')
        return res.redirect('/signin')
      })
      .catch(err => next(err))
  },
  signInPage: (req, res) => {
    res.render('signin')
  },
  signIn: (req, res) => {
    req.flash('success_messages', '成功登入！')
    res.redirect('/restaurants')
  },
  logout: (req, res) => {
    req.flash('success_messages', '登出成功！')
    req.logout()
    res.redirect('/signin')
  },
  getUser: (req, res, next) => {
    return Promise.all([
      User.findByPk(req.params.id, {
        include: [
          { model: User, as: 'Followers' },
          { model: User, as: 'Followings' },
          { model: Restaurant, as: 'FavoritedRestaurants' }
        ],
        nest: true
      }),
      Comment.findAll({
        where: { userId: req.params.id },
        include: { model: Restaurant, attributes: ['id', 'image'] },
        group: 'restaurantId',
        attributes: ['restaurantId'],
        nest: true,
        raw: true
      })
    ])
      .then(([userProfile, comments]) => {
        const loginUser = getUser(req)
        assert(userProfile, "User didn't exist!")
        res.render('users/profile', {
          user: loginUser,
          userProfile: {
            ...userProfile.toJSON(),
            isFollowed: loginUser.Followings.some(
              followingUser => followingUser.id === userProfile.id
            )
          },
          comments
        })
      })
      .catch(err => next(err))
  },
  editUser: (req, res, next) => {
    const { id } = req.params // 使用者請求edit的userId
    return User.findByPk(id, { raw: true })
      .then(user => {
        assert(user, "User didn't exist!")
        res.render('users/edit', { user })
      })
      .catch(err => next(err))
  },
  putUser: (req, res, next) => {
    const { name } = req.body
    assert(name, 'User name is required!')
    const { file } = req
    const { id } = req.params // 使用者請求put的userId

    return Promise.all([User.findByPk(id), imgurFileHandler(file)])
      .then(([user, filePath]) => {
        assert(user, "User didn't exist!")
        return user.update({ name, image: filePath || user.image })
      })
      .then(user => {
        req.flash('success_messages', '使用者資料編輯成功')
        res.redirect(`/users/${id}`)
      })
      .catch(err => next(err))
  },
  addFavorite: (req, res, next) => {
    const { restaurantId } = req.params
    const loginUser = getUser(req)
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Favorite.findOne({ where: { userId: loginUser.id, restaurantId } })
    ])
      .then(([restaurant, favorite]) => {
        assert(restaurant, "Restaurant didn't exist!")
        if (favorite) throw new Error('You have favorited this restaurant!')

        return Favorite.create({ userId: loginUser.id, restaurantId })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeFavorite: (req, res, next) => {
    const { restaurantId } = req.params
    const loginUser = getUser(req)
    return Favorite.findOne({
      where: { userId: loginUser.id, restaurantId }
    })
      .then(favorite => {
        assert(favorite, "You haven't favorited this restaurant")
        return favorite.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  addLike: (req, res, next) => {
    const { restaurantId } = req.params
    const loginUser = getUser(req)
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Like.findOne({ where: { userId: loginUser.id, restaurantId } })
    ])
      .then(([restaurant, like]) => {
        assert(restaurant, "Restaurant didn't exist!")
        if (like) throw new Error('You have liked this restaurant!')
        return Like.create({ userId: loginUser.id, restaurantId })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeLike: (req, res, next) => {
    const loginUser = getUser(req)
    return Like.findOne({
      where: { userId: loginUser.id, restaurantId: req.params.restaurantId }
    })
      .then(like => {
        assert(like, "You haven't liked this restaurant")
        return like.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  getTopUsers: (req, res, next) => {
    return User.findAll({ include: [{ model: User, as: 'Followers' }] })
      .then(users => {
        const result = users
          .map(user => ({
            ...user.toJSON(),
            followerCount: user.Followers.length,
            isFollowed: req.user.Followings.some(
              followingUser => followingUser.id === user.id
            )
          }))
          .sort((a, b) => b.followerCount - a.followerCount)
        res.render('top-users', { users: result })
      })
      .catch(err => next(err))
  },
  addFollowing: (req, res, next) => {
    const { userId } = req.params
    const loginUser = getUser(req)
    return Promise.all([
      User.findByPk(userId, { raw: true }),
      Followship.findOne({
        where: { followerId: loginUser.id, followingId: userId },
        raw: true
      })
    ])
      .then(([user, followship]) => {
        assert(user, "User didn't exist!")
        if (followship) throw new Error('You have followed this user!')
        return Followship.create({
          followerId: loginUser.id,
          followingId: userId
        })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeFollowing: (req, res, next) => {
    const { userId } = req.params
    const loginUser = getUser(req)
    return Followship.findOne({
      where: { followerId: loginUser.id, followingId: userId }
    })
      .then(followship => {
        assert(followship, "You haven't followed this user!")
        return followship.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  }
}

module.exports = userController
