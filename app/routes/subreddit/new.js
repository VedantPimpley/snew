import Ember from 'ember';
import ListingRouteMixin from 'snew/mixins/listing-route';
import {fetchIds} from 'snew/services/snoocore';

export default Ember.Route.extend(ListingRouteMixin, {
  listingType: 'new',

  model(params) {
    console.log('params', params);
    return this.makeApiCall(params).then(this.normalizeResponse.bind(this))
      .then(result => {
        result.params = params;
        return result;
      })
      .catch(() => {
        const sub = this.modelFor('subreddit');
        const url = `https://api.pushshift.io/reddit/search/submission?subreddit=${sub.name}&limit=${params.limit}&beforeid=${params.after.split('_').pop()}`;

        return Ember.RSVP.resolve(Ember.$.ajax(url)).then(result => result.data)
          .then(posts => {
            posts.forEach(post => post.banned_by = true);
            return posts;
          });
      });
  },

  afterModel(posts) {
    let subreddit = this.modelFor('subreddit').display_name;

    if (!posts || !posts.params || subreddit === 'multi') {
      return;
    }

    if (subreddit === 'all') {
      subreddit = '';
    }

    const client = this.get('snoocore.client');
    const oldest = posts.get('lastObject');
    let newest = posts.get('firstObject');

    if (!posts.params.after && subreddit) {
      newest = {id: ''};
    }

    const url = [
      'https://api.pushshift.io/reddit/search/submission?limit=500&sort=desc&',
      `subreddit=${subreddit}&afterid=${oldest.id}&beforeid=${newest.id}`
    ].join('');

    return Ember.RSVP.resolve(Ember.$.ajax(url)).then(result => result.data).then(allPosts => {
      const postsById = {};
      const removed = allPosts.filter(post => {
        postsById[post.id] = post;
        return !posts.findBy('id', post.id);
      });

      if (removed.length) {
        return fetchIds(client, removed.map(post => 't3_' + post.id)).then(restored => {
          restored.filter(post => post.selftext === '[removed]').forEach(selfpost => {
            selfpost.selftext_html = null;
            selfpost.selftext = postsById[selfpost.id].selftext;
          });
          restored.forEach(post => post.banned_by = true);
          restored = restored.filter(post => post.author !== '[deleted]').sortBy('id');
          restored.forEach(restoredPost => {
            let position = posts.indexOf(posts.find(post => post.id < restoredPost.id));

            posts.insertAt(position, restoredPost);
          });
        });
      }
    });
  },

  renderTemplate: function() {
    this.render(this.get('listingClass') + '/new', {
      controller: this.controller
    });
  }
});
