remote_dir=/home/bot/hnbot
rsync -v --exclude node_modules --exclude .git -c -r ./ d1:${remote_dir}/