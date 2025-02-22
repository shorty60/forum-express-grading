const assert = require('assert')
const { Restaurant, Category, Comment, User } = require('../models')
const { getOffset, getPagination } = require('../helpers/pagination-helper')
const { getUser } = require('../helpers/auth-helpers')

const restaurantController = {
  getRestaurants: (req, res, next) => {
    const DEFAULT_LIMIT = 9
    const categoryId = Number(req.query.categoryId) || ''
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || DEFAULT_LIMIT
    const offset = getOffset(limit, page)

    return Promise.all([
      Category.findAll({ raw: true }),
      Restaurant.findAndCountAll({
        include: Category,
        where: { ...(categoryId ? { categoryId } : {}) },
        offset,
        limit,
        nest: true,
        raw: true
      })
    ])
      .then(([categories, restaurants]) => {
        if (!restaurants.rows.length) {
          return req.flash('error_messages', 'No restaurant is found!')
        }
        const loginUser = getUser(req)
        const favoritedRestaurantsId =
          loginUser && loginUser.FavoritedRestaurants.map(fr => fr.id)
        const likedRestaurantsId =
          loginUser && loginUser.LikedRestaurants.map(lr => lr.id) // 取liked id
        const datas = restaurants.rows.map(r => ({
          ...r,
          description: r.description.substring(0, 50),
          isFavorited: favoritedRestaurantsId.includes(r.id),
          isLiked: likedRestaurantsId.includes(r.id)
        }))
        res.render('restaurants', {
          restaurants: datas,
          categories,
          categoryId,
          pagination: getPagination(limit, page, restaurants.count)
        })
      })
      .catch(err => next(err))
  },
  getRestaurant: (req, res, next) => {
    return Restaurant.findByPk(req.params.id, {
      include: [
        Category,
        {
          model: Comment,
          include: User
        },
        { model: User, as: 'FavoritedUsers' },
        { model: User, as: 'LikedUsers' }
      ],
      order: [[Comment, 'updatedAt', 'DESC']]
    })
      .then(restaurant => {
        assert(restaurant, "Restaurant did't exist!")
        return restaurant.increment('viewCounts')
      })
      .then(restaurant => {
        const loginUser = getUser(req)
        const isFavorited = restaurant.FavoritedUsers.some(
          fu => fu.id === loginUser.id
        )
        const isLiked = restaurant.LikedUsers.some(
          likeduser => likeduser.id === loginUser.id
        )
        res.render('restaurant', {
          restaurant: restaurant.toJSON(),
          isFavorited,
          isLiked
        })
      })
      .catch(err => next(err))
  },
  getDashboard: (req, res, next) => {
    return Restaurant.findByPk(req.params.id, {
      include: Category
    })
      .then(restaurant => {
        assert(restaurant, "Restaurant did't exist!")
        res.render('dashboard', {
          restaurant: restaurant.toJSON()
        })
      })
      .catch(err => next(err))
  },
  getFeeds: (req, res, next) => {
    return Promise.all([
      Restaurant.findAll({
        limit: 10,
        order: [['createdAt', 'DESC']],
        include: Category,
        nest: true,
        raw: true
      }),
      Comment.findAll({
        limit: 10,
        order: [['createdAt', 'DESC']],
        include: [Restaurant, User],
        nest: true,
        raw: true
      })
    ])
      .then(([restaurants, comments]) => {
        const descriptionLength = 200
        if (!restaurants.length) {
          req.flash('error_messages', '還沒有餐廳資料')
        }
        if (!comments.length) {
          req.flash('error_messages', '還沒有評論，快來新增第一筆吧')
        }
        restaurants = restaurants.map(r => ({
          ...r,
          description: r.description
            .substring(0, descriptionLength)
            .concat(' ', '...')
        }))
        res.render('feeds', { restaurants, comments })
      })
      .catch(err => next(err))
  },
  getTopRestaurants: (req, res, next) => {
    return Restaurant.findAll({
      include: [{ model: User, as: 'FavoritedUsers' }]
    })
      .then(restaurants => {
        const loginUser = getUser(req)
        const result = restaurants
          .map(restaurant => ({
            ...restaurant.toJSON(),
            description: restaurant.description.substring(0, 100),
            favoritedCount: restaurant.FavoritedUsers.length,
            isFavorited:
              loginUser &&
              loginUser.FavoritedRestaurants.some(
                favoritedRestaurant => favoritedRestaurant.id === restaurant.id
              )
          }))
          .sort((a, b) => b.favoritedCount - a.favoritedCount)
          .slice(0, 10)
        res.render('top-restaurants', { restaurants: result })
      })
      .catch(err => next(err))
  }
}
module.exports = restaurantController
