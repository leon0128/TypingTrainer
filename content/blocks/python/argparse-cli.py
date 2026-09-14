def build_parser():
    parser = argparse.ArgumentParser(description="Resize images in a directory.")
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("--width", type=int, default=800)
    parser.add_argument("--quality", type=int, choices=range(1, 101), default=85)
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser
