Page({
  navTo(e) {
    const page = e.currentTarget.dataset.page;
    let url = '';
    
    switch (page) {
      case 'idphoto':
        url = '/pages/idphoto/idphoto';
        break;
      case 'compress':
        url = '/pages/compress/compress';
        break;
      case 'batch':
        url = '/pages/batch/batch';
        break;
    }

    if (url) {
      wx.navigateTo({ url });
    }
  }
});