md_files=$(ls *.md)

for file in $md_files
do
  echo $file
  folder=$(echo $file | awk '{print substr($1, 1, 10)}')
  echo $folder
  sed -i .bak "/^layout:/d" $file
  sed -i .bak "/^description:/d" $file
  sed -i .bak "/^category:/d" $file
  sed -i .bak "/^date:/d" $file
  sed -i .bak "2a\\
date: \"${folder}\"
" $file

  mkdir $folder
  cp $file $folder
done

rm *.bak
rm *.md
