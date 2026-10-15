// bookmarks class and utils
// user can bookmark any ae page

var Bookmark = function(url, name, comment) {
  this.Url = url;
  this.Name = name;
  this.Comment = comment;

}

var Bookmarks = function() {
  this.StorageKey = "PersonalBookmarks";
  this.PersonalBookmarks = [];
  this.GuildBookmarks = [];

  this.log = function (msg) {
    lg.log('BMark:' + msg);
  }

  this.WatchForUrls = function () {
    $('a[href*="view="], a[href*="loc="], a[href*="fleet="], a[href*="base="]').on('contextmenu', function (e) {
      var href = 'https://' + GmServer.serverName + GmServer.baseUrl + '/' + $(this).attr('href');
      var txt = $(this).text();
      bMark.log('Right Click on:' + href);
      chrome.runtime.sendMessage(new Message('sidebar', 'IncomingBookmark', {
        Href: href,
        Text: txt
      }));
    });
    return;
  }

  this.AddPersonalBookmark = function(url, name, comment) {

    bMark.PersonalBookmarks.push(new Bookmark(url, name, comment));
  }

  this.SavePersonalBookmarks = function () {
    try {
      if (bMark.PersonalBookmarks.length == 0) return;

      var sp = new StoragePacket(bMark.PersonalBookmarks, bMark.StorageKey, ctG.SendingPlayerId);
      ctF.SaveStorage(sp);
    } catch (e) {
      lg.debug(e, 'Error in SavePersonalBookmarks:', {
        stack: true
      });
    }
  }
}
