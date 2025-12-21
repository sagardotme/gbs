# gbs
Givat-Brenner Stories. People, photos and stories.


cd /home/haim/gbs && git pull origin master --force
cd /home/haim/gbs && rm -rf scripts && yarn build
rm -r /home/www-data/tol_master/static/aurelia/scripts && cp -r /home/haim/gbs/scripts /home/www-data/tol_master/static/aurelia/ && cd /home/www-data/ && ./restart