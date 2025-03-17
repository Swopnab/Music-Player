from tkinter import *
import pygame
import os

root = Tk()
root.title('Music Player')
root.geometry("500x300")

pygame.mixer.init()

songlist = Listbox(root, bg="black", fg="white", width=100, height=15)
songlist.pack()

root.mainloop()