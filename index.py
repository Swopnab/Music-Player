from tkinter import filedialog
from tkinter import *
import pygame
import os

root = Tk()
root.title('Music Player')
root.geometry("500x300")

pygame.mixer.init()

menubar=Menu(root)
root.config(menu=menubar)

songs=[]
current_song=""
paused=False

def load_music():
    global current_song
    root.directory=filedialog.askdirectory()

    for song in os.listdir(roo.directory):
        name, ext=os.path.splitext(song)
        if ext=='.mp3':
            songs.append(song)

    for song in songs:
        songlist.insert("end, song")
    
    songlist.selection_set(0)
    current_song=song[songlist.curselection()[0]]

organise_menu=Menu(menubar, tearoff=False)
organise_menu.add_command(label='Select Folder', command=load_music)
menubar.add_cascade(label='Organize', menu=organise_menu)

songlist = Listbox(root, bg="black", fg="white", width=100, height=15)
songlist.pack()

play_btn_image = PhotoImage(file='play.png')
pause_btn_image = PhotoImage(file='pause.png')
next_btn_image = PhotoImage(file='next.png')
prev_btn_image = PhotoImage(file='previous.png')

control_frame = Frame(root)
control_frame.pack()

play_btn = Button(control_frame, image=play_btn_image, borderwidth=0)
pause_btn = Button(control_frame, image=pause_btn_image, borderwidth=0)
next_btn = Button(control_frame, image=next_btn_image, borderwidth=0)
prev_btn = Button(control_frame, image=prev_btn_image, borderwidth=0)

play_btn.grid(row=0, column=1, pady=10, padx=7)
pause_btn.grid(row=0, column=2, pady=10, padx=7)
next_btn.grid(row=0, column=3, pady=10, padx=7)
prev_btn.grid(row=0, column=0, pady=10, padx=7)


root.mainloop()