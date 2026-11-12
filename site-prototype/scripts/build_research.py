from build_articles import main

# Compatibility for existing research:build commands. All article sections now
# use the manuscript registry; no independent legacy catalog is regenerated.
if __name__ == '__main__':
    main()
